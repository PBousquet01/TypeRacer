// Signing in with GitHub or Discord (AUTH-1, AUTH-2), and linking either one
// to an account that already exists (AUTH-3).
//
// The OAuth "authorization code" flow, in three steps:
//   1. /api/auth/<provider>/start sends the browser to the provider with a
//      random `state`, which is also kept in a short-lived cookie.
//   2. The provider sends the browser back to /api/auth/<provider>/callback
//      with a one-time `code` and the same `state`.
//   3. If the state matches the cookie, this browser really started the flow
//      (it isn't a link someone planted to sign the player into the wrong
//      account). The server then trades the code for a token, server to
//      server and with the client secret, and asks the provider who it is.
//
// Only the provider's id is trusted to recognise someone: a GitHub login or
// a Discord username can be changed or passed on to someone else.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Provider } from "../lib/types";

export const PROVIDERS: Provider[] = ["github", "discord"];
const STATE_COOKIE = "chocobo_oauth";
const STATE_MINUTES = 10;
const TIMEOUT_MS = 10_000;

export interface ExternalProfile {
  id: string;
  login: string;
  name: string | null;
}

export function isProvider(value: unknown): value is Provider {
  return PROVIDERS.includes(value as Provider);
}

function credentials(provider: Provider) {
  const prefix = provider.toUpperCase();
  return { id: process.env[`${prefix}_CLIENT_ID`], secret: process.env[`${prefix}_CLIENT_SECRET`] };
}

/** The providers whose keys are set, so the sign-in page only offers those. */
export function configuredProviders(): Provider[] {
  return PROVIDERS.filter((p) => credentials(p).id && credentials(p).secret);
}

// Render sets RENDER_EXTERNAL_URL to the site's public address; locally it's
// the dev server. Must match a callback URL registered with the provider.
function redirectUri(provider: Provider): string {
  const base =
    process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${process.env.PORT || 3000}`;
  return `${base.replace(/\/$/, "")}/api/auth/${provider}/callback`;
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export function authorizeUrl(provider: Provider, state: string): string {
  const { id } = credentials(provider);
  const params = new URLSearchParams({ client_id: id!, redirect_uri: redirectUri(provider), state });
  if (provider === "github") return `https://github.com/login/oauth/authorize?${params}`;
  params.set("response_type", "code");
  params.set("scope", "identify");
  return `https://discord.com/oauth2/authorize?${params}`;
}

/** The state cookie is tied to one provider, so a GitHub state can't finish a Discord sign-in. */
export function stateCookie(provider: Provider | null, state: string): string {
  return [
    `${STATE_COOKIE}=${provider ? `${provider}.${state}` : ""}`,
    "Path=/api/auth",
    "HttpOnly",
    // Lax, not Strict: the cookie has to come along when the provider sends
    // the browser back here, which is a top-level navigation from their site.
    "SameSite=Lax",
    `Max-Age=${provider ? STATE_MINUTES * 60 : 0}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function stateMatches(cookieHeader: string | undefined, provider: Provider, state: string | null): boolean {
  const saved = String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!saved || !state) return false;
  const expected = Buffer.from(saved);
  const received = Buffer.from(`${provider}.${state}`);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function getJson(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function githubProfile(code: string): Promise<ExternalProfile | null> {
  const { id, secret } = credentials("github");
  const token = await getJson("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri("github") }),
  });
  // GitHub answers a bad code with 200 and an `error` field, so check the token itself.
  if (typeof token?.access_token !== "string") return null;
  const user = await getJson("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "chocobo-race" },
  });
  if (!user || user.id == null || typeof user.login !== "string") return null;
  return { id: String(user.id), login: user.login, name: typeof user.name === "string" ? user.name : null };
}

async function discordProfile(code: string): Promise<ExternalProfile | null> {
  const { id, secret } = credentials("discord");
  const token = await getJson("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri("discord") }),
  });
  if (typeof token?.access_token !== "string") return null;
  const user = await getJson("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!user || typeof user.id !== "string" || typeof user.username !== "string") return null;
  return { id: user.id, login: user.username, name: typeof user.global_name === "string" ? user.global_name : null };
}

/** Who the provider says this is, or null if anything along the way failed. */
export async function fetchProfile(provider: Provider, code: string): Promise<ExternalProfile | null> {
  try {
    return provider === "github" ? await githubProfile(code) : await discordProfile(code);
  } catch (err) {
    console.error(`${provider} sign-in failed`, err);
    return null;
  }
}
