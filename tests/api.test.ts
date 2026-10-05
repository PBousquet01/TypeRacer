import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { handleApi } from "../server/api";
import { migrate, sql } from "../server/db";
import { recordRace } from "../server/stats";
import sharp from "sharp";
import type { Player, Room } from "../server/rooms";
import type { HistoryPage, PastRace, PublicPlayer } from "../lib/types";

let http: Server;
let base = "";
const username = `t${Date.now().toString(36)}`; // a throwaway account, deleted after
const password = "correct-horse-1";

// GitHub and Discord are played by a stand-in: requests to them get canned
// answers, everything else (this test's own server) goes through.
const realFetch = globalThis.fetch;
const fakeId = `9${Date.now()}`; // provider ids no real account has
let fakeProfile: { id: string; login: string; name: string | null } = { id: `${fakeId}1`, login: "octo.cat", name: "Octo Cat" };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = String(input instanceof Request ? input.url : input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  if (target.includes("/access_token") || target.includes("/oauth2/token")) {
    const sent = String(init?.body ?? "");
    return json(sent.includes("good-code") ? { access_token: "token" } : { error: "bad_verification_code" });
  }
  if (target === "https://api.github.com/user") return json({ ...fakeProfile, id: Number(fakeProfile.id) });
  if (target === "https://discord.com/api/users/@me") return json({ id: fakeProfile.id, username: fakeProfile.login, global_name: fakeProfile.name });
  return realFetch(input, init);
}) as typeof fetch;
process.env.GITHUB_CLIENT_ID = "test-github-id";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.DISCORD_CLIENT_ID = "test-discord-id";
process.env.DISCORD_CLIENT_SECRET = "test-discord-secret";

/** Starts a sign-in, then comes back from the provider with `code`. Returns the final redirect. */
async function oauthRoundTrip(provider: "github" | "discord", code: string, session = "") {
  const start = await fetch(`${base}/api/auth/${provider}/start`, { redirect: "manual", headers: { cookie: session } });
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  const stateCookie = start.headers.get("set-cookie")!.split(";")[0];
  return fetch(`${base}/api/auth/${provider}/callback?code=${code}&state=${state}`, {
    redirect: "manual",
    headers: { cookie: [stateCookie, session].filter(Boolean).join("; ") },
  });
}

const sessionFrom = (res: Response) =>
  res.headers.getSetCookie().find((c) => c.startsWith("chocobo_session="))?.split(";")[0] ?? "";

function post(path: string, body: unknown, cookie = "") {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await migrate();
  http = createServer((req, res) => void handleApi(req, res));
  await new Promise<void>((resolve) => http.listen(0, resolve));
  base = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await sql`DELETE FROM users WHERE lower(username) = lower(${username})`;
  await sql`DELETE FROM users WHERE id IN (SELECT user_id FROM identities WHERE provider_id LIKE ${`${fakeId}%`})`;
  http.close();
});

describe("accounts", () => {
  test("bad usernames and short passwords are refused with a code", async () => {
    const bad = await post("/api/auth/signup", { username: "x", password });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "username-format" });

    const short = await post("/api/auth/signup", { username, password: "123" });
    expect(await short.json()).toEqual({ error: "password-short" });
  });

  test("a rider name with special characters or too long is refused", async () => {
    for (const displayName of ["<script>", "a".repeat(17)]) {
      const res = await post("/api/auth/signup", { username, password, displayName });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "name-format" });
    }
  });

  test("signing up signs you in with an HttpOnly cookie", async () => {
    const res = await post("/api/auth/signup", { username, password, displayName: "Tester" });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await res.json()).user.displayName).toBe("Tester");
  });

  test("the same username can't be taken twice, whatever the case", async () => {
    const res = await post("/api/auth/signup", { username: username.toUpperCase(), password });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "username-taken" });
  });

  test("a wrong password is refused", async () => {
    const res = await post("/api/auth/login", { username, password: "not-the-password" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "wrong-credentials" });
  });

  test("the session cookie identifies you, and logging out ends it", async () => {
    const login = await post("/api/auth/login", { username, password });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];

    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    expect((await me.json()).user.username).toBe(username);

    await post("/api/auth/logout", {}, cookie);
    const after = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    expect((await after.json()).user).toBeNull();
  });

  test("the password is never stored as typed", async () => {
    const [row]: { password_hash: string }[] = await sql`
      SELECT password_hash FROM users WHERE lower(username) = lower(${username})`;
    expect(row.password_hash).not.toContain(password);
    expect(row.password_hash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("GitHub and Discord (AUTH-1, AUTH-2, AUTH-3)", () => {
  test("start sends the browser to GitHub with a state that's also in a cookie", async () => {
    const res = await fetch(`${base}/api/auth/github/start`, { redirect: "manual" });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(to.searchParams.get("client_id")).toBe("test-github-id");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`github.${to.searchParams.get("state")}`);
    expect(cookie).toContain("HttpOnly");
  });

  test("a callback whose state doesn't match is refused", async () => {
    const res = await fetch(`${base}/api/auth/github/callback?code=good-code&state=forged`, { redirect: "manual" });
    expect(res.headers.get("location")).toBe("/account?error=oauth-failed");
    expect(sessionFrom(res)).toBe("");
  });

  test("a code the provider rejects signs no one in", async () => {
    const res = await oauthRoundTrip("github", "bad-code");
    expect(res.headers.get("location")).toBe("/account?error=oauth-failed");
    expect(sessionFrom(res)).toBe("");
  });

  test("the first sign-in makes an account; the next one finds it again", async () => {
    const first = await oauthRoundTrip("github", "good-code");
    expect(first.headers.get("location")).toBe("/");
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: sessionFrom(first) } })).json();
    expect(me.user.displayName).toBe("Octo Cat");
    expect(me.user.username).toMatch(/^octo_cat\d*$/);
    expect(me.user.linked).toEqual(["github"]);

    const again = await oauthRoundTrip("github", "good-code");
    const meAgain = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: sessionFrom(again) } })).json();
    expect(meAgain.user.id).toBe(me.user.id);
  });

  test("a signed-in rider can link Discord, but not someone else's", async () => {
    const login = await post("/api/auth/login", { username, password });
    const session = sessionFrom(login);

    fakeProfile = { id: `${fakeId}2`, login: "octo", name: null };
    const linked = await oauthRoundTrip("discord", "good-code", session);
    expect(linked.headers.get("location")).toBe("/account?linked=discord");
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
    expect(me.user.linked).toEqual(["discord"]);

    fakeProfile = { id: `${fakeId}1`, login: "octo.cat", name: "Octo Cat" }; // already the GitHub of another account
    const taken = await oauthRoundTrip("github", "good-code", session);
    expect(taken.headers.get("location")).toBe("/account?error=identity-taken");
  });

  test("an account made with GitHub has no password to guess", async () => {
    const [row]: { username: string }[] = await sql`
      SELECT username FROM users JOIN identities ON identities.user_id = users.id
       WHERE provider_id = ${`${fakeId}1`}`;
    const res = await post("/api/auth/login", { username: row.username, password: "" });
    expect(res.status).toBe(401);
  });
});

describe("input validation (TECH-07)", () => {
  test("a body that isn't the expected shape gets the matching error code", async () => {
    const cases: [string, unknown, string][] = [
      ["/api/auth/signup", { username: ["phil"], password: "longenough" }, "username-format"],
      ["/api/auth/signup", { username: "philtest", password: 12345678 }, "password-short"],
      ["/api/auth/signup", [], "bad-request"],
      ["/api/auth/login", { username: "philtest", password: { $ne: "" } }, "bad-request"],
    ];
    for (const [path, body, error] of cases) {
      const res = await post(path, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
  });

  test("a body that isn't JSON is a bad request", async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: "POST", body: "username=phil" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad-request" });
  });

  test("a text in a language the site doesn't have is refused", async () => {
    const res = await fetch(`${base}/api/text?lang=de`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad-request" });
  });
});

describe("rooms", () => {
  const signedIn = async () => sessionFrom(await post("/api/auth/login", { username, password }));

  test("AUTH-03, SALLE-01: a guest can't get a room code to host with", async () => {
    const res = await fetch(`${base}/api/rooms`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "sign-in-to-host" });
  });

  test("SALLE-02: the server hands a host a fresh six-character code", async () => {
    const cookie = await signedIn();
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/api/rooms`, { method: "POST", headers: { cookie } });
      expect(res.status).toBe(200);
      const { code } = await res.json();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(5);
  });

  test("SALLE-03: a new room can ask for a visibility, but only a real one", async () => {
    const cookie = await signedIn();
    expect((await post("/api/rooms", { visibility: "public" }, cookie)).status).toBe(200);
    const bad = await post("/api/rooms", { visibility: "secret" }, cookie);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad-request" });
  });

  test("JOIN-03: quick play answers with a room code, or null when no public room is free", async () => {
    const res = await post("/api/rooms/quick", {});
    expect(res.status).toBe(200);
    const { code } = await res.json();
    expect(code === null || /^[A-HJKMNP-Z2-9]{6}$/.test(code)).toBe(true);
  });
});

describe("texts and stats", () => {
  test("TXT-3: texts come from the bank, in the language asked for", async () => {
    // A passage from the bank, cut to the default length (25 words).
    const fr = await (await fetch(`${base}/api/text?lang=fr`)).json();
    const start = fr.text.split(" ").slice(0, 6).join(" ");
    const [match]: { id: number }[] = await sql`SELECT id FROM passages WHERE language = 'fr' AND starts_with(body, ${start})`;
    expect(match).toBeDefined();
    expect(fr.text.split(" ")).toHaveLength(25);

    const words = await (await fetch(`${base}/api/text?kind=words`)).json();
    expect(words.text.split(" ").length).toBe(25);
  });

  test("stats need an account", async () => {
    const res = await fetch(`${base}/api/stats/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "sign-in-for-stats" });
  });

  test("HIST-01, HIST-02: the history comes a page at a time, and a race's full results only to its riders", async () => {
    const stamp = Date.now().toString(36);
    const [rider, other] = [`h${stamp}`, `o${stamp}`];
    const cookie = sessionFrom(await post("/api/auth/signup", { username: rider, password, displayName: "Histo" }));
    const otherCookie = sessionFrom(await post("/api/auth/signup", { username: other, password, displayName: "Other" }));
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    try {
      // 12 races, each with the rider, a guest and a bot.
      for (let i = 0; i < 12; i++) {
        const mine = { userId: me.user.id, finished: true, wpm: 40 + i, accuracy: 95, score: 38 + i, timeMs: 30_000, place: 1, samples: [30, 40 + i], missed: { e: 1 } };
        const field = [
          { id: "sock-1", name: "Histo", place: 1, wpm: 40 + i, racing: true, samples: [30, 40 + i], missed: { e: 1 } },
          { id: "sock-2", name: "Guest", place: 2, wpm: 30, racing: true, samples: [20, 30], missed: {} },
          { id: "bot-9", name: "Boko", bot: "expert", place: 3, wpm: 25, racing: true, samples: [25], missed: {} },
        ] as unknown as PublicPlayer[];
        const room = { code: "HSTRY2", settings: { bonuses: false } } as unknown as Room;
        await recordRace(room, field, [["sock-1", mine as unknown as Player], ["sock-2", { userId: null, finished: true } as unknown as Player]]);
      }

      expect((await fetch(`${base}/api/history`)).status).toBe(401);
      const first: HistoryPage = await (await fetch(`${base}/api/history?page=1`, { headers: { cookie } })).json();
      expect(first.pages).toBe(2);
      expect(first.races).toHaveLength(10);
      expect(first.races[0].wpm).toBe(51); // newest first
      const second: HistoryPage = await (await fetch(`${base}/api/history?page=2`, { headers: { cookie } })).json();
      expect(second.races.map((r) => r.wpm)).toEqual([41, 40]);
      expect((await fetch(`${base}/api/history?page=zero`, { headers: { cookie } })).status).toBe(400);

      const runId = first.races[0].runId!;
      const race: PastRace = await (await fetch(`${base}/api/races/${runId}`, { headers: { cookie } })).json();
      expect(race.players.map((p) => p.name)).toEqual(["Histo", "Guest", "Boko"]); // the whole field
      expect(race.myId).toBe("sock-1");
      expect(race.players[0].samples).toEqual([30, 51]);

      const stranger = await fetch(`${base}/api/races/${runId}`, { headers: { cookie: otherCookie } });
      expect(stranger.status).toBe(404);
      expect(await stranger.json()).toEqual({ error: "no-race" });
      expect((await fetch(`${base}/api/races/abc`, { headers: { cookie } })).status).toBe(400);
    } finally {
      await sql`DELETE FROM users WHERE lower(username) IN (lower(${rider}), lower(${other}))`;
      await sql`DELETE FROM race_runs WHERE room_code = 'HSTRY2'`;
    }
  });

  test("RES-04: beating your best WPM is a personal record; a first or a slower race isn't", async () => {
    const name = `p${Date.now().toString(36)}`;
    const cookie = sessionFrom(await post("/api/auth/signup", { username: name, password, displayName: "Recorder" }));
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    const race = (wpm: number) => {
      const player = { userId: me.user.id, finished: true, wpm, accuracy: 100, score: wpm, timeMs: 20_000, place: 1, samples: [wpm], missed: {} };
      const field = [{ id: "sock-1", name: "Recorder", place: 1, wpm, racing: true, samples: [wpm], missed: {}, personalBest: false }];
      const room = { code: "RECRD1", settings: { bonuses: false } } as unknown as Room;
      return recordRace(room, field as unknown as PublicPlayer[], [["sock-1", player as unknown as Player]]);
    };
    try {
      expect(await race(50)).toEqual([]); // first race: nothing to beat
      expect(await race(45)).toEqual([]);
      expect(await race(50)).toEqual([]); // equalling it isn't beating it
      expect(await race(61)).toEqual(["sock-1"]);
      const history: HistoryPage = await (await fetch(`${base}/api/history`, { headers: { cookie } })).json();
      const latest: PastRace = await (await fetch(`${base}/api/races/${history.races[0].runId}`, { headers: { cookie } })).json();
      expect(latest.players[0].personalBest).toBe(true); // kept for the history too
      // AUTH-06: the progress chart's data, oldest race first.
      const stats = await (await fetch(`${base}/api/stats/me`, { headers: { cookie } })).json();
      expect(stats.progress.map((p: { wpm: number }) => p.wpm)).toEqual([50, 45, 50, 61]);
    } finally {
      await sql`DELETE FROM users WHERE lower(username) = lower(${name})`;
      await sql`DELETE FROM race_runs WHERE room_code = 'RECRD1'`;
    }
  });

  test("AUTH-05: a signed-in rider changes their display name; the username stays", async () => {
    expect((await post("/api/account/name", { displayName: "Nobody" })).status).toBe(401);
    const login = await post("/api/auth/login", { username, password });
    const cookie = sessionFrom(login);
    const renamed = await post("/api/account/name", { displayName: "  Éloïse   la Rapide " }, cookie);
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).user).toMatchObject({ displayName: "Éloïse la Rapide", username });
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    expect(me.user.displayName).toBe("Éloïse la Rapide");
    for (const bad of ["x", "<b>bold</b>", "a".repeat(17), 42]) {
      const res = await post("/api/account/name", { displayName: bad }, cookie);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "name-format" });
    }
  });

  test("AUTH-04, SEC-02: a profile photo is checked by its bytes and its size, then stored resized", async () => {
    const upload = (body: Blob | string, type: string, cookie = "") =>
      fetch(`${base}/api/account/avatar`, { method: "POST", headers: { "Content-Type": type, cookie }, body });
    expect((await upload("x", "image/png")).status).toBe(401);
    const cookie = sessionFrom(await post("/api/auth/login", { username, password }));

    const refused = async (body: Blob | string, type: string, status: number, error: string) => {
      const res = await upload(body, type, cookie);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
    };
    await refused("just some text", "image/png", 400, "image-type"); // says PNG, isn't one
    await refused(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])]), "image/png", 400, "image-unreadable");
    await refused("GIF89a", "image/gif", 415, "image-type");
    await refused(new Blob([new Uint8Array(2 * 1024 * 1024 + 10)]), "image/png", 413, "image-too-big");

    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#e8734a" } }).png().toBuffer();
    const ok = await upload(new Blob([new Uint8Array(png)]), "image/png", cookie);
    expect(ok.status).toBe(200);
    const { user } = await ok.json();
    expect(user.avatarUrl).toMatch(new RegExp(`^/api/avatars/${user.id}\\?v=\\d+$`));

    const served = await fetch(base + user.avatarUrl);
    expect(served.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);

    const removed = await fetch(`${base}/api/account/avatar`, { method: "DELETE", headers: { cookie } });
    expect((await removed.json()).user.avatarUrl).toBeNull();
    expect((await fetch(base + user.avatarUrl)).status).toBe(404);
  });

  test("admin routes are closed to everyone else", async () => {
    const res = await post("/api/admin/mount", { username, mount: "fox" });
    expect(res.status).toBe(403);
  });

  test("unknown endpoints answer with a code", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown-endpoint" });
  });
});
