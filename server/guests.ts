// AUTH-02, SALLE-06: a guest has no account, but the server still needs to
// recognise them across tabs and reloads (one room per person). Each browser
// gets a random guest id in a cookie, signed with an HMAC so a guest can't
// pick someone else's id: the signature is checked on every connection.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE = "chocobo_guest";
const GUEST_DAYS = 365;

// Without GUEST_SECRET, a random secret per start: guests get a new id after
// a restart, which only matters for rooms (they live in memory anyway).
const secret =
  process.env.GUEST_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") console.warn("GUEST_SECRET is not set: guest cookies reset on every restart");
    return randomBytes(32).toString("hex");
  })();

const signatureOf = (id: string) => createHmac("sha256", secret).update(id).digest("base64url");

export function newGuestId(): string {
  return randomBytes(16).toString("base64url"); // 128 bits
}

export function guestCookie(id: string): string {
  return [
    `${GUEST_COOKIE}=${id}.${signatureOf(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${GUEST_DAYS * 24 * 60 * 60}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

/** The guest id from a raw Cookie header, or null if there is none or its signature is wrong. */
export function guestFromCookies(cookieHeader: string | undefined): string | null {
  const value = String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === GUEST_COOKIE)?.[1];
  const [id, signature] = (value ?? "").split(".");
  if (!id || !signature) return null;
  const expected = Buffer.from(signatureOf(id));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
