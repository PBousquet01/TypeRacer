import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { handleApi } from "../server/api";
import { migrate, sql } from "../server/db";

let http: Server;
let base = "";
const username = `t${Date.now().toString(36)}`; // a throwaway account, deleted after
const password = "correct-horse-1";

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
  await sql`DELETE FROM users WHERE lower(username) = lower(${username})`;
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
