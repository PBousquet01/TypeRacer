// Accounts and sessions.
//
// Passwords are never stored: Bun.password.hash uses argon2id (with a random
// salt per password), and verify re-hashes the attempt to compare. The
// session cookie holds a random token that means nothing on its own — the
// server looks it up in the sessions table.
import { randomBytes } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { identities, sessions, unlocks, users } from "./schema";
import { cleanRiderName } from "../lib/names";
import type { ErrorCode, Provider, User } from "../lib/types";
import type { ExternalProfile } from "./oauth";
import { credentials, parse } from "./schemas";

export const SESSION_COOKIE = "chocobo_session";
const SESSION_DAYS = 30;
/** For the admin CLI, which takes the same accounts as the sign-up form. */
export function validateCredentials(username: unknown, password: unknown): ErrorCode | null {
  const result = parse(credentials, { username, password });
  return result.ok ? null : result.error;
}

// Usernames are case-insensitive; this matches the users_username_lower index.
const usernameIs = (username: string) => sql`lower(${users.username}) = lower(${username})`;

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

  const [taken] = await db.select({ id: users.id }).from(users).where(usernameIs(username));
  if (taken) return { error: "username-taken" };

  const hash = await Bun.password.hash(password); // argon2id by default
  const [row] = await db
    .insert(users)
    .values({ username, displayName: riderName, passwordHash: hash })
    .returning({ id: users.id });

  return { user: (await findUserById(row.id))! };
}

export async function verifyLogin(username: string, password: unknown): Promise<User | null> {
  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(usernameIs(username ?? ""));
  // Hash even when the user doesn't exist (or signs in with GitHub/Discord
  // only, and has no password), so every refusal takes the same time.
  const hash =
    row?.passwordHash ??
    "$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const attempt = typeof password === "string" ? password : "";
  const ok = await Bun.password.verify(attempt, hash).catch(() => false);
  return ok && row ? findUserById(row.id) : null;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    token,
    userId,
    expiresAt: sql`now() + ${`${SESSION_DAYS} days`}::interval`,
  });
  return token;
}

export async function destroySession(token: string | null): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
}

/** The signed-in user for a session token, or null. Expired sessions are cleaned up. */
export async function userForToken(token: string | null): Promise<User | null> {
  if (!token) return null;
  await db.delete(sessions).where(lte(sessions.expiresAt, sql`now()`));
  const [row] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.token, token));
  return row ? findUserById(row.userId) : null;
}

export async function findUserById(id: number): Promise<User | null> {
  const [row] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, id));
  if (!row) return null;
  return {
    ...row,
    unlocks: await mountsFor(row.id),
    linked: await linkedProviders(row.id),
  };
}

async function linkedProviders(userId: number): Promise<Provider[]> {
  const rows = await db
    .select({ provider: identities.provider })
    .from(identities)
    .where(eq(identities.userId, userId))
    .orderBy(identities.provider);
  return rows.map((r) => r.provider);
}

/** The account a GitHub or Discord identity belongs to, if any. */
export async function findUserByIdentity(provider: Provider, providerId: string): Promise<User | null> {
  const [row] = await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, provider), eq(identities.providerId, providerId)));
  return row ? findUserById(row.userId) : null;
}

export async function linkIdentity(userId: number, provider: Provider, providerId: string): Promise<void> {
  await db.insert(identities).values({ provider, providerId, userId });
}

/** A free username made from the provider's login: "Phil.B" → "Phil_B", then "Phil_B2", "Phil_B3"… */
async function freeUsername(login: string): Promise<string> {
  const base = login.replace(/[^a-z0-9_-]/gi, "_").slice(0, 16).padEnd(3, "_");
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? "" : String(n);
    const candidate = base.slice(0, 16 - suffix.length) + suffix;
    const [taken] = await db.select({ id: users.id }).from(users).where(usernameIs(candidate));
    if (!taken) return candidate;
  }
  return `rider_${randomBytes(4).toString("hex")}`;
}

/** First sign-in with GitHub or Discord: a new account, with no password, tied to that identity. */
export async function createOAuthUser(provider: Provider, profile: ExternalProfile): Promise<User> {
  const username = await freeUsername(profile.login);
  const displayName =
    cleanRiderName(profile.name?.slice(0, 16)) ?? cleanRiderName(profile.login.slice(0, 16)) ?? username;
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ username, displayName, passwordHash: null })
      .returning({ id: users.id });
    await tx.insert(identities).values({ provider, providerId: profile.id, userId: row.id });
    return row.id;
  });
  return (await findUserById(id))!;
}

export async function mountsFor(userId: number): Promise<string[]> {
  const rows = await db
    .select({ mount: unlocks.mount })
    .from(unlocks)
    .where(eq(unlocks.userId, userId))
    .orderBy(unlocks.mount);
  return rows.map((r) => r.mount);
}

export async function grantMount(userId: number, mount: string): Promise<void> {
  await db.insert(unlocks).values({ userId, mount }).onConflictDoNothing();
}

export async function revokeMount(userId: number, mount: string): Promise<void> {
  await db.delete(unlocks).where(and(eq(unlocks.userId, userId), eq(unlocks.mount, mount)));
}

/** AUTH-05: the name shown in races and on the leaderboard. The username used to sign in doesn't change. */
export async function setDisplayName(userId: number, displayName: string): Promise<User | null> {
  await db.update(users).set({ displayName }).where(eq(users.id, userId));
  return findUserById(userId);
}

export async function findUserByUsername(username: string | undefined): Promise<User | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(usernameIs(username ?? ""));
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
