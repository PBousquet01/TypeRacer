// Accounts and sessions.
//
// Passwords are never stored: Bun.password.hash uses argon2id (with a random
// salt per password), and verify re-hashes the attempt to compare. The
// session cookie holds a random token that means nothing on its own — the
// server looks it up in the sessions table.
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import type { User } from "../lib/types";

export const SESSION_COOKIE = "chocobo_session";
const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-z0-9_-]{3,16}$/i;
const MIN_PASSWORD = 8;

export function validateCredentials(username: string | undefined, password: unknown): string | null {
  if (!USERNAME_RE.test(username ?? "")) {
    return "Usernames are 3–16 characters: letters, numbers, - and _ only.";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return `Passwords need at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

export async function createUser({
  username,
  password,
  displayName,
}: {
  username: string;
  password: string;
  displayName: string;
}): Promise<{ user: User } | { error: string }> {
  const [taken] = await sql`
    SELECT id FROM users WHERE lower(username) = lower(${username})`;
  if (taken) return { error: "That username is taken." };

  const hash = await Bun.password.hash(password); // argon2id by default
  const [row]: { id: number }[] = await sql`
    INSERT INTO users (username, display_name, password_hash)
    VALUES (${username}, ${(displayName || username).slice(0, 16)}, ${hash})
    RETURNING id`;

  return { user: (await findUserById(row.id))! };
}

export async function verifyLogin(username: string, password: unknown): Promise<User | null> {
  const [row]: { id: number; password_hash: string }[] = await sql`
    SELECT id, password_hash FROM users WHERE lower(username) = lower(${username ?? ""})`;
  // Hash even when the user doesn't exist, so a missing account and a wrong
  // password take the same time to answer.
  const hash =
    row?.password_hash ??
    "$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const attempt = typeof password === "string" ? password : "";
  const ok = await Bun.password.verify(attempt, hash).catch(() => false);
  return ok && row ? findUserById(row.id) : null;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, now() + ${`${SESSION_DAYS} days`}::interval)`;
  return token;
}

export async function destroySession(token: string | null): Promise<void> {
  if (token) await sql`DELETE FROM sessions WHERE token = ${token}`;
}

/** The signed-in user for a session token, or null. Expired sessions are cleaned up. */
export async function userForToken(token: string | null): Promise<User | null> {
  if (!token) return null;
  await sql`DELETE FROM sessions WHERE expires_at <= now()`;
  const [row]: { user_id: number }[] = await sql`
    SELECT user_id FROM sessions WHERE token = ${token}`;
  return row ? findUserById(row.user_id) : null;
}

export async function findUserById(id: number): Promise<User | null> {
  const [row]: { id: number; username: string; display_name: string; is_admin: boolean }[] = await sql`
    SELECT id, username, display_name, is_admin FROM users WHERE id = ${id}`;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    unlocks: await mountsFor(row.id),
  };
}

export async function mountsFor(userId: number): Promise<string[]> {
  const rows: { mount: string }[] = await sql`
    SELECT mount FROM unlocks WHERE user_id = ${userId} ORDER BY mount`;
  return rows.map((r) => r.mount);
}

export async function grantMount(userId: number, mount: string): Promise<void> {
  await sql`
    INSERT INTO unlocks (user_id, mount) VALUES (${userId}, ${mount})
    ON CONFLICT DO NOTHING`;
}

export async function revokeMount(userId: number, mount: string): Promise<void> {
  await sql`DELETE FROM unlocks WHERE user_id = ${userId} AND mount = ${mount}`;
}

export async function findUserByUsername(username: string | undefined): Promise<User | null> {
  const [row]: { id: number }[] = await sql`
    SELECT id FROM users WHERE lower(username) = lower(${username ?? ""})`;
  return row ? findUserById(row.id) : null;
}

/** Reads our session cookie out of a raw Cookie header. */
export function tokenFromCookies(cookieHeader: string | undefined): string | null {
  const found = String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE);
  return found ? decodeURIComponent(found[1] ?? "") : null;
}

export function sessionCookie(token: string, { clear = false } = {}): string {
  const age = clear ? 0 : SESSION_DAYS * 24 * 60 * 60;
  return [
    `${SESSION_COOKIE}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly", // JavaScript can't read it, so an XSS bug can't steal the session
    "SameSite=Lax",
    `Max-Age=${age}`,
  ].join("; ");
}
