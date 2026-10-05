// Small JSON API for accounts and stats, served by server.ts before Next
// sees the request. Keeping it here (instead of in a Next route handler)
// means the database code never goes through the bundler.
import type { IncomingMessage, ServerResponse } from "node:http";
import { and, count, desc, eq, isNotNull, max, sql } from "drizzle-orm";
import { db } from "./db";
import { raceRuns, races, users } from "./schema";
import { pickText } from "./texts";
import { quickRaceRoom, reserveRoomCode } from "./rooms";
import { deleteAvatar, loadAvatar, MAX_AVATAR_BYTES, prepareAvatar, saveAvatar } from "./avatars";
import {
  avatarContentType,
  displayNameBody,
  historyQuery,
  loginBody,
  mountBody,
  newRoomBody,
  oauthCallbackQuery,
  parse,
  queryOf,
  raceId,
  signupBody,
  textQuery,
} from "./schemas";
import { authorizeUrl, configuredProviders, fetchProfile, isProvider, newState, stateCookie, stateMatches } from "./oauth";
import {
  createOAuthUser,
  createSession,
  createUser,
  destroySession,
  findUserById,
  findUserByIdentity,
  findUserByUsername,
  grantMount,
  linkIdentity,
  revokeMount,
  sessionCookie,
  tokenFromCookies,
  userForToken,
  verifyLogin,
  setDisplayName,
} from "./auth";
import type { ErrorCode, HistoryPage, LeaderboardRow, PastRace, ProgressPoint, RecentRace, StatsSummary, User } from "../lib/types";

const MAX_BODY = 4096;

/**
 * The raw request body, or "too-big" past `limit` bytes. Past the limit,
 * the rest is read and thrown away rather than the connection being cut, so
 * the browser gets the answer instead of a network error; a sender that
 * keeps going far beyond it is cut off.
 */
function readBytes(req: IncomingMessage, limit: number): Promise<Buffer | "too-big" | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
      else if (size > limit * 4) req.destroy();
    });
    req.on("end", () => resolve(size > limit ? "too-big" : Buffer.concat(chunks)));
    req.on("error", () => resolve(size > limit ? "too-big" : null));
    req.on("close", () => resolve(size > limit ? "too-big" : null));
  });
}


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

/** The request body as parsed JSON, or null if it isn't JSON or is too big. Not yet validated. */
function readJson(req: IncomingMessage): Promise<unknown> {
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
        resolve(raw ? JSON.parse(raw) : {});
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
    avatarUrl: user.avatarUrl,
  };
}

const winsOf = sql<number>`count(*) filter (where ${races.place} = 1)::int`;

const PROGRESS_RACES = 100;

async function statsFor(userId: number): Promise<{ summary: StatsSummary; progress: ProgressPoint[] }> {
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

  // AUTH-06: the WPM of their last races, oldest first, for the progress chart.
  const recent = await db
    .select({ at: races.finishedAt, wpm: races.wpm })
    .from(races)
    .where(eq(races.userId, userId))
    .orderBy(desc(races.finishedAt), desc(races.id))
    .limit(PROGRESS_RACES);
  const progress = recent.reverse().map((r) => ({ at: r.at.toISOString(), wpm: r.wpm }));

  return { summary, progress };
}

const HISTORY_PAGE = 10;

/** HIST-01: a page of a rider's races, newest first. */
async function historyFor(userId: number, page: number): Promise<HistoryPage> {
  const [{ total }] = await db.select({ total: count() }).from(races).where(eq(races.userId, userId));
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));
  const rows = await db
    .select({
      runId: races.runId,
      roomCode: races.roomCode,
      wpm: races.wpm,
      accuracy: races.accuracy,
      score: races.score,
      timeMs: races.timeMs,
      place: races.place,
      riders: races.riders,
      finishedAt: races.finishedAt,
    })
    .from(races)
    .where(eq(races.userId, userId))
    .orderBy(desc(races.finishedAt), desc(races.id))
    .limit(HISTORY_PAGE)
    .offset((Math.min(page, pages) - 1) * HISTORY_PAGE);
  const list: RecentRace[] = rows.map((r) => ({ ...r, finishedAt: r.finishedAt.toISOString() }));
  return { races: list, page: Math.min(page, pages), pages };
}

/** HIST-02: a race's full results, for someone who was in it; null otherwise. */
async function pastRace(userId: number, id: number): Promise<PastRace | null> {
  const [row] = await db
    .select({
      id: raceRuns.id,
      roomCode: raceRuns.roomCode,
      finishedAt: raceRuns.finishedAt,
      bonuses: raceRuns.bonuses,
      players: raceRuns.players,
      myId: races.playerId,
    })
    .from(races)
    .innerJoin(raceRuns, eq(raceRuns.id, races.runId))
    .where(and(eq(races.userId, userId), eq(races.runId, id)));
  return row ? { ...row, finishedAt: row.finishedAt.toISOString() } : null;
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

    const query = parse(oauthCallbackQuery, queryOf(url));
    if (!query.ok) return fail("oauth-failed"), true;
    if (query.data.error) return fail("oauth-cancelled"), true; // they said no on the provider's page
    if (!stateMatches(req.headers.cookie, provider, query.data.state ?? null)) return fail("oauth-failed"), true;
    const profile = await fetchProfile(provider, query.data.code ?? "");
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
    const body = parse(signupBody, await readJson(req));
    if (!body.ok) return send(res, 400, { error: body.error }), true;

    const { username, password, displayName = "" } = body.data;
    const created = await createUser({ username, password, displayName });
    if ("error" in created) {
      return send(res, created.error === "username-taken" ? 409 : 400, { error: created.error }), true;
    }

    const token = await createSession(created.user.id);
    send(res, 201, { user: publicUser(created.user) }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = parse(loginBody, await readJson(req));
    if (!body.ok) return send(res, 400, { error: body.error }), true;

    const user = await verifyLogin(body.data.username, body.data.password);
    if (!user) return send(res, 401, { error: "wrong-credentials" }), true;

    const token = await createSession(user.id);
    send(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }

  // AUTH-04, SEC-02: upload or remove the profile photo. The body is the
  // image itself; server/avatars.ts decides whether it's one.
  if (path === "/api/account/avatar" && (method === "POST" || method === "DELETE")) {
    if (!me) return send(res, 401, { error: "sign-in-needed" }), true;
    if (method === "DELETE") {
      await deleteAvatar(me.id);
    } else {
      const declared = parse(avatarContentType, req.headers["content-type"]);
      if (!declared.ok) return send(res, 415, { error: "image-type" }), true;
      const bytes = await readBytes(req, MAX_AVATAR_BYTES);
      if (bytes === "too-big") return send(res, 413, { error: "image-too-big" }), true;
      if (!bytes) return send(res, 400, { error: "bad-request" }), true;
      const prepared = await prepareAvatar(bytes);
      if ("error" in prepared) return send(res, 400, { error: prepared.error }), true;
      await saveAvatar(me.id, prepared.image);
    }
    send(res, 200, { user: publicUser(await findUserById(me.id)) });
    return true;
  }

  const avatarMatch = /^\/api\/avatars\/([^/]+)$/.exec(path);
  if (avatarMatch && method === "GET") {
    const id = parse(raceId, avatarMatch[1]);
    const image = id.ok ? await loadAvatar(id.data) : null;
    if (!image) return send(res, 404, { error: "no-account" }), true;
    // The address carries the photo's version, so it can be cached for good.
    res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" });
    res.end(image);
    return true;
  }

  // AUTH-05: change the name shown in races; checked like any rider name.
  if (path === "/api/account/name" && method === "POST") {
    if (!me) return send(res, 401, { error: "sign-in-needed" }), true;
    const body = parse(displayNameBody, await readJson(req));
    if (!body.ok) return send(res, 400, { error: body.error }), true;
    send(res, 200, { user: publicUser(await setDisplayName(me.id, body.data.displayName)) });
    return true;
  }

  if (path === "/api/auth/logout" && method === "POST") {
    await destroySession(tokenFromCookies(req.headers.cookie));
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", { clear: true }) });
    return true;
  }

  if (path === "/api/text" && method === "GET") {
    const query = parse(textQuery, queryOf(url));
    if (!query.ok) return send(res, 400, { error: query.error }), true;
    const text = await pickText({ language: query.data.lang, kind: query.data.kind });
    send(res, 200, { text });
    return true;
  }

  if (path === "/api/history" && method === "GET") {
    if (!me) return send(res, 401, { error: "sign-in-for-stats" }), true;
    const query = parse(historyQuery, queryOf(url));
    if (!query.ok) return send(res, 400, { error: query.error }), true;
    send(res, 200, await historyFor(me.id, query.data.page));
    return true;
  }

  const raceMatch = /^\/api\/races\/([^/]+)$/.exec(path);
  if (raceMatch && method === "GET") {
    if (!me) return send(res, 401, { error: "sign-in-for-stats" }), true;
    const id = parse(raceId, raceMatch[1]);
    if (!id.ok) return send(res, 400, { error: id.error }), true;
    const race = await pastRace(me.id, id.data);
    if (!race) return send(res, 404, { error: "no-race" }), true;
    send(res, 200, race);
    return true;
  }

  if (path === "/api/stats/me" && method === "GET") {
    if (!me) return send(res, 401, { error: "sign-in-for-stats" }), true;
    send(res, 200, await statsFor(me.id));
    return true;
  }

  // SALLE-02: a fresh room code for a host about to open a room, with the
  // visibility it should start with (SALLE-03; code-only by default).
  // AUTH-03, SALLE-01: guests can't open rooms; the code is held for this account.
  if (path === "/api/rooms" && method === "POST") {
    const me = await userFromRequest(req);
    if (!me) return send(res, 401, { error: "sign-in-to-host" }), true;
    const body = parse(newRoomBody, await readJson(req));
    if (!body.ok) return send(res, 400, { error: body.error }), true;
    send(res, 200, { code: reserveRoomCode(me.id, body.data.visibility) });
    return true;
  }

  // JOIN-03: the public room a quick-play rider should join, or null.
  if (path === "/api/rooms/quick" && method === "POST") {
    send(res, 200, { code: quickRaceRoom() });
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

    const body = parse(mountBody, await readJson(req));
    if (!body.ok) return send(res, 400, { error: body.error }), true;
    const { username, mount, revoke } = body.data;
    const target = await findUserByUsername(username);
    if (!target) return send(res, 404, { error: "no-account" }), true;

    if (revoke) await revokeMount(target.id, mount);
    else await grantMount(target.id, mount);
    send(res, 200, { user: publicUser(await findUserByUsername(target.username)) });
    return true;
  }

  send(res, 404, { error: "unknown-endpoint" });
  return true;
}
