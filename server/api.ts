// Small JSON API for accounts and stats, served by server.ts before Next
// sees the request. Keeping it here (instead of in a Next route handler)
// means the database code never goes through the bundler.
import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "./db";
import { pickText } from "./texts";
import {
  createSession,
  createUser,
  destroySession,
  findUserByUsername,
  grantMount,
  revokeMount,
  sessionCookie,
  tokenFromCookies,
  userForToken,
  validateCredentials,
  verifyLogin,
} from "./auth";
import type { LeaderboardRow, RecentRace, StatsSummary, User } from "../lib/types";

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
  };
}

async function statsFor(userId: number): Promise<{ summary: StatsSummary; recent: RecentRace[] }> {
  const [summary]: StatsSummary[] = await sql`
    SELECT COUNT(*)::int                       AS races,
           MAX(wpm)::int                       AS "bestWpm",
           ROUND(AVG(wpm))::int                AS "avgWpm",
           ROUND(AVG(accuracy))::int           AS "avgAccuracy",
           COUNT(*) FILTER (WHERE place = 1)::int AS wins
      FROM races WHERE user_id = ${userId}`;

  const recent: RecentRace[] = await sql`
    SELECT room_code AS "roomCode", wpm, accuracy, time_ms AS "timeMs",
           place, riders, to_char(finished_at, 'YYYY-MM-DD HH24:MI') AS "finishedAt"
      FROM races WHERE user_id = ${userId}
      ORDER BY finished_at DESC, id DESC LIMIT 10`;

  return { summary, recent };
}

/** Returns true when it answered, false to let Next.js handle the URL. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return false;

  const method = req.method?.toUpperCase();
  const me = await userFromRequest(req);

  if (path === "/api/auth/me" && method === "GET") {
    send(res, 200, { user: publicUser(me) });
    return true;
  }

  if (path === "/api/auth/signup" && method === "POST") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "Bad request." }), true;

    const username = String(body.username ?? "").trim();
    const problem = validateCredentials(username, body.password);
    if (problem) return send(res, 400, { error: problem }), true;

    const created = await createUser({
      username,
      password: body.password as string, // validateCredentials checked it's a string
      displayName: String(body.displayName ?? username).trim(),
    });
    if ("error" in created) return send(res, 409, { error: created.error }), true;

    const token = await createSession(created.user.id);
    send(res, 201, { user: publicUser(created.user) }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "Bad request." }), true;

    const user = await verifyLogin(String(body.username ?? "").trim(), body.password);
    if (!user) return send(res, 401, { error: "Wrong username or password." }), true;

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
    send(res, 200, { text: pickText() });
    return true;
  }

  if (path === "/api/stats/me" && method === "GET") {
    if (!me) return send(res, 401, { error: "Sign in to see your stats." }), true;
    send(res, 200, await statsFor(me.id));
    return true;
  }

  if (path === "/api/stats/leaderboard" && method === "GET") {
    const rows: LeaderboardRow[] = await sql`
      SELECT users.display_name AS name, MAX(races.wpm)::int AS wpm,
             COUNT(races.id)::int AS races,
             COUNT(*) FILTER (WHERE races.place = 1)::int AS wins
        FROM races JOIN users ON users.id = races.user_id
       GROUP BY users.id, users.display_name
       ORDER BY wpm DESC LIMIT 10`;
    send(res, 200, { leaderboard: rows });
    return true;
  }

  if (path === "/api/admin/mount" && method === "POST") {
    if (!me?.isAdmin) return send(res, 403, { error: "Admins only." }), true;

    const body = await readJson(req);
    const target = await findUserByUsername(String(body?.username ?? "").trim());
    const mount = String(body?.mount ?? "").trim();
    if (!target) return send(res, 404, { error: "No account with that username." }), true;
    if (!mount) return send(res, 400, { error: "Which mount?" }), true;

    if (body?.revoke) await revokeMount(target.id, mount);
    else await grantMount(target.id, mount);
    send(res, 200, { user: publicUser(await findUserByUsername(target.username)) });
    return true;
  }

  send(res, 404, { error: "Unknown endpoint." });
  return true;
}
