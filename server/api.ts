// Small JSON API for accounts and stats, served by server.ts before Next
// sees the request. Keeping it here (instead of in a Next route handler)
// means the database code never goes through the bundler.
import type { IncomingMessage, ServerResponse } from "node:http";
import { count, desc, eq, isNotNull, max, sql } from "drizzle-orm";
import { db } from "./db";
import { races, users } from "./schema";
import { isKind, isLanguage, pickText } from "./texts";
import { authorizeUrl, configuredProviders, fetchProfile, isProvider, newState, stateCookie, stateMatches } from "./oauth";
import {
  createOAuthUser,
  createSession,
  createUser,
  destroySession,
  findUserByIdentity,
  findUserByUsername,
  grantMount,
  linkIdentity,
  revokeMount,
  sessionCookie,
  tokenFromCookies,
  userForToken,
  validateCredentials,
  verifyLogin,
} from "./auth";
import type { ErrorCode, LeaderboardRow, RecentRace, StatsSummary, User } from "../lib/types";

const MAX_BODY = 4096;

type Body = Record<string, unknown>;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function redirect(res: ServerResponse, location: string, cookies: string[] = []) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", "Set-Cookie": cookies });
  res.end();
}

function readJson(req: IncomingMessage): Promise<Body | null> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        raw = "";
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        resolve(parsed && typeof parsed === "object" ? (parsed as Body) : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export function userFromRequest(req: IncomingMessage): Promise<User | null> {
  return userForToken(tokenFromCookies(req.headers.cookie));
}

/** Everything a signed-in player's own client is allowed to know about them. */
function publicUser(user: User | null): User | null {
  return user && {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    unlocks: user.unlocks,
    linked: user.linked,
  };
}

const winsOf = sql<number>`count(*) filter (where ${races.place} = 1)::int`;

async function statsFor(userId: number): Promise<{ summary: StatsSummary; recent: RecentRace[] }> {
  const [summary]: StatsSummary[] = await db
    .select({
      races: count(),
      bestWpm: max(races.wpm),
      bestScore: max(races.score),
      avgWpm: sql<number | null>`round(avg(${races.wpm}))::int`,
      avgAccuracy: sql<number | null>`round(avg(${races.accuracy}))::int`,
      wins: winsOf,
    })
    .from(races)
    .where(eq(races.userId, userId));

  const recent: RecentRace[] = await db
    .select({
      roomCode: races.roomCode,
      wpm: races.wpm,
      accuracy: races.accuracy,
      score: races.score,
      timeMs: races.timeMs,
      place: races.place,
      riders: races.riders,
      finishedAt: sql<string>`to_char(${races.finishedAt}, 'YYYY-MM-DD HH24:MI')`,
    })
    .from(races)
    .where(eq(races.userId, userId))
    .orderBy(desc(races.finishedAt), desc(races.id))
    .limit(10);

  return { summary, recent };
}

/** Returns true when it answered, false to let Next.js handle the URL. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return false;

  const method = req.method?.toUpperCase();

  // For the host's health checks. Deliberately doesn't touch the database:
  // frequent checks would keep a sleeping database awake for nothing.
  if (path === "/api/health") {
    send(res, 200, { ok: true });
    return true;
  }

  const me = await userFromRequest(req);

  if (path === "/api/auth/me" && method === "GET") {
    send(res, 200, { user: publicUser(me), providers: configuredProviders() });
    return true;
  }

  // AUTH-1, AUTH-2, AUTH-3. The flow itself is explained in server/oauth.ts.
  const oauth = /^\/api\/auth\/([a-z]+)\/(start|callback)$/.exec(path);
  if (oauth && isProvider(oauth[1]) && method === "GET") {
    const provider = oauth[1];
    const forget = stateCookie(null, "");
    const fail = (code: ErrorCode) => redirect(res, `/account?error=${code}`, [forget]);
    if (!configuredProviders().includes(provider)) return fail("oauth-unavailable"), true;

    if (oauth[2] === "start") {
      const state = newState();
      redirect(res, authorizeUrl(provider, state), [stateCookie(provider, state)]);
      return true;
    }

    if (url.searchParams.get("error")) return fail("oauth-cancelled"), true; // they said no on the provider's page
    if (!stateMatches(req.headers.cookie, provider, url.searchParams.get("state"))) return fail("oauth-failed"), true;
    const profile = await fetchProfile(provider, url.searchParams.get("code") ?? "");
    if (!profile) return fail("oauth-failed"), true;

    const owner = await findUserByIdentity(provider, profile.id);
    // Already signed in: this attaches the identity to the current account.
    if (me) {
      if (owner && owner.id !== me.id) return fail("identity-taken"), true;
      if (!owner) {
        if (me.linked.includes(provider)) return fail("already-linked"), true;
        await linkIdentity(me.id, provider, profile.id);
      }
      redirect(res, `/account?linked=${provider}`, [forget]);
      return true;
    }

    const user = owner ?? (await createOAuthUser(provider, profile));
    const token = await createSession(user.id);
    redirect(res, "/", [forget, sessionCookie(token)]);
    return true;
  }

  if (path === "/api/auth/signup" && method === "POST") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "bad-request" }), true;

    const username = String(body.username ?? "").trim();
    const problem = validateCredentials(username, body.password);
    if (problem) return send(res, 400, { error: problem }), true;

    const created = await createUser({
      username,
      password: body.password as string, // validateCredentials checked it's a string
      displayName: typeof body.displayName === "string" ? body.displayName : "",
    });
    if ("error" in created) {
      return send(res, created.error === "username-taken" ? 409 : 400, { error: created.error }), true;
    }

    const token = await createSession(created.user.id);
    send(res, 201, { user: publicUser(created.user) }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "bad-request" }), true;

    const user = await verifyLogin(String(body.username ?? "").trim(), body.password);
    if (!user) return send(res, 401, { error: "wrong-credentials" }), true;

    const token = await createSession(user.id);
    send(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }

  if (path === "/api/auth/logout" && method === "POST") {
    await destroySession(tokenFromCookies(req.headers.cookie));
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", { clear: true }) });
    return true;
  }

  if (path === "/api/text" && method === "GET") {
    const language = url.searchParams.get("lang");
    const kind = url.searchParams.get("kind");
    const text = await pickText({
      language: isLanguage(language) ? language : undefined,
      kind: isKind(kind) ? kind : undefined,
    });
    send(res, 200, { text });
    return true;
  }

  if (path === "/api/stats/me" && method === "GET") {
    if (!me) return send(res, 401, { error: "sign-in-for-stats" }), true;
    send(res, 200, await statsFor(me.id));
    return true;
  }

  if (path === "/api/stats/leaderboard" && method === "GET") {
    const best = sql<number>`max(${races.score})::int`;
    const rows: LeaderboardRow[] = await db
      .select({
        name: users.displayName,
        score: best,
        wpm: sql<number>`max(${races.wpm})::int`,
        races: count(races.id),
        wins: winsOf,
      })
      .from(races)
      .innerJoin(users, eq(users.id, races.userId))
      .where(isNotNull(races.score))
      .groupBy(users.id, users.displayName)
      .orderBy(desc(best))
      .limit(10);
    send(res, 200, { leaderboard: rows });
    return true;
  }

  if (path === "/api/admin/mount" && method === "POST") {
    if (!me?.isAdmin) return send(res, 403, { error: "admin-only" }), true;

    const body = await readJson(req);
    const target = await findUserByUsername(String(body?.username ?? "").trim());
    const mount = String(body?.mount ?? "").trim();
    if (!target) return send(res, 404, { error: "no-account" }), true;
    if (!mount) return send(res, 400, { error: "which-mount" }), true;

    if (body?.revoke) await revokeMount(target.id, mount);
    else await grantMount(target.id, mount);
    send(res, 200, { user: publicUser(await findUserByUsername(target.username)) });
    return true;
  }

  send(res, 404, { error: "unknown-endpoint" });
  return true;
}
