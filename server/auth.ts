// Accounts and sessions.
//
// Passwords are never stored: Bun.password.hash uses argon2id (with a random
// salt per password), and verify re-hashes the attempt to compare. The
// session cookie holds a random token that means nothing on its own — the
// server looks it up in the sessions table.
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { USERNAME_RE, cleanRiderName } from "../lib/names";
import type { ErrorCode, Provider, User } from "../lib/types";
import type { ExternalProfile } from "./oauth";

export const SESSION_COOKIE = "chocobo_session";
const SESSION_DAYS = 30;
const MIN_PASSWORD = 8;

export function validateCredentials(username: string | undefined, password: unknown): ErrorCode | null {
  if (!USERNAME_RE.test(username ?? "")) {
    return "username-format";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return "password-short";
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
}): Promise<{ user: User } | { error: ErrorCode }> {
  const riderName = cleanRiderName(displayName || username);
  if (!riderName) return { error: "name-format" };

  const [taken] = await sql`
    SELECT id FROM users WHERE lower(username) = lower(${username})`;
  if (taken) return { error: "username-taken" };

  const hash = await Bun.password.hash(password); // argon2id by default
  const [row]: { id: number }[] = await sql`
    INSERT INTO users (username, display_name, password_hash)
    VALUES (${username}, ${riderName}, ${hash})
    RETURNING id`;

  return { user: (await findUserById(row.id))! };
}

export async function verifyLogin(username: string, password: unknown): Promise<User | null> {
  const [row]: { id: number; password_hash: string | null }[] = await sql`
    SELECT id, password_hash FROM users WHERE lower(username) = lower(${username ?? ""})`;
  // Hash even when the user doesn't exist (or signs in with GitHub/Discord
  // only, and has no password), so every refusal takes the same time.
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
    linked: await linkedProviders(row.id),
  };
}

async function linkedProviders(userId: number): Promise<Provider[]> {
  const rows: { provider: Provider }[] = await sql`
    SELECT provider FROM identities WHERE user_id = ${userId} ORDER BY provider`;
  return rows.map((r) => r.provider);
}

/** The account a GitHub or Discord identity belongs to, if any. */
export async function findUserByIdentity(provider: Provider, providerId: string): Promise<User | null> {
  const [row]: { user_id: number }[] = await sql`
    SELECT user_id FROM identities WHERE provider = ${provider} AND provider_id = ${providerId}`;
  return row ? findUserById(row.user_id) : null;
}

export async function linkIdentity(userId: number, provider: Provider, providerId: string): Promise<void> {
  await sql`
    INSERT INTO identities (provider, provider_id, user_id) VALUES (${provider}, ${providerId}, ${userId})`;
}

/** A free username made from the provider's login: "Phil.B" → "Phil_B", then "Phil_B2", "Phil_B3"… */
async function freeUsername(login: string): Promise<string> {
  const base = login.replace(/[^a-z0-9_-]/gi, "_").slice(0, 16).padEnd(3, "_");
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? "" : String(n);
    const candidate = base.slice(0, 16 - suffix.length) + suffix;
    const [taken] = await sql`SELECT 1 FROM users WHERE lower(username) = lower(${candidate})`;
    if (!taken) return candidate;
  }
  return `rider_${randomBytes(4).toString("hex")}`;
}

/** First sign-in with GitHub or Discord: a new account, with no password, tied to that identity. */
export async function createOAuthUser(provider: Provider, profile: ExternalProfile): Promise<User> {
  const username = await freeUsername(profile.login);
  const displayName =
    cleanRiderName(profile.name?.slice(0, 16)) ?? cleanRiderName(profile.login.slice(0, 16)) ?? username;
  const id = await sql.begin(async (tx) => {
    const [row]: { id: number }[] = await tx`
      INSERT INTO users (username, display_name, password_hash)
      VALUES (${username}, ${displayName}, NULL)
      RETURNING id`;
    await tx`
      INSERT INTO identities (provider, provider_id, user_id) VALUES (${provider}, ${profile.id}, ${row.id})`;
    return row.id;
  });
  return (await findUserById(id))!;
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
    // Online the site is HTTPS-only, so the cookie never travels in clear.
    // Not in development: browsers drop Secure cookies on a plain-http LAN address.
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
