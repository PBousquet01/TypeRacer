import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { handleApi } from "../server/api";
import { migrate, sql } from "../server/db";

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
  test("SALLE-02: the server hands a host a fresh six-character code", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/api/rooms`, { method: "POST" });
      expect(res.status).toBe(200);
      const { code } = await res.json();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(5);
  });

  test("SALLE-03: a new room can ask for a visibility, but only a real one", async () => {
    expect((await post("/api/rooms", { visibility: "public" })).status).toBe(200);
    const bad = await post("/api/rooms", { visibility: "secret" });
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
    const fr = await (await fetch(`${base}/api/text?lang=fr`)).json();
    const [match]: { id: number }[] = await sql`SELECT id FROM passages WHERE body = ${fr.text}`;
    expect(match).toBeDefined();

    const words = await (await fetch(`${base}/api/text?kind=words`)).json();
    expect(words.text.split(" ").length).toBe(30);
  });

  test("stats need an account", async () => {
    const res = await fetch(`${base}/api/stats/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "sign-in-for-stats" });
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
