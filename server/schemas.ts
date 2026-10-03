// TECH-07: everything that reaches the server from a browser goes through one
// of these schemas first: Socket.IO messages, API bodies and query strings.
// The TypeScript types in lib/types.ts describe a well-behaved client; these
// describe what's actually accepted.
//
// A schema's error messages are the API's error codes (`bad-code`,
// `name-format`…), so a refusal reaches the browser as a code it already
// knows how to translate. Anything else malformed is a `bad-request`.
import { z } from "zod";
import { USERNAME_RE, cleanRiderName } from "../lib/names";
import { isRoomCode, normalizeRoomCode } from "../lib/rules";
import { BOT_LEVEL_IDS } from "../lib/bots";
import type { ErrorCode } from "../lib/types";

const codes = new Set<string>();
/** An error message that is also an error code the browser can translate. */
function code(c: ErrorCode): ErrorCode {
  codes.add(c);
  return c;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };

export function parse<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues[0]?.message ?? "";
  return { ok: false, error: codes.has(message) ? (message as ErrorCode) : "bad-request" };
}

// Shared pieces

const language = z.enum(["en", "fr"]);
const textKind = z.enum(["sentences", "words"]);

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 256;

const roomCode = z
  .string({ error: code("bad-code") })
  .max(32, code("bad-code"))
  .transform(normalizeRoomCode)
  .refine(isRoomCode, code("bad-code"));

/** A rider name, tidied (see cleanRiderName) or refused. */
const riderName = z
  .string({ error: code("name-format") })
  .max(64, code("name-format"))
  .transform((raw, ctx) => {
    const name = cleanRiderName(raw);
    if (name === null) {
      ctx.addIssue({ code: "custom", message: code("name-format") });
      return z.NEVER;
    }
    return name;
  });

// Socket.IO messages (server/rooms.ts)

export const joinPayload = z.object({
  code: roomCode,
  name: riderName,
  color: z.string().max(32).optional(),
  role: z.enum(["host", "rider"]).optional(),
  clientId: z.string().max(64).nullish(),
  lang: language.optional(),
  invite: z.string().max(64).optional(),
});

const visibility = z.enum(["public", "code", "private"]);

export const settingsChange = z.object({
  language: language.optional(),
  kind: textKind.optional(),
  hostRides: z.boolean().optional(),
  visibility: visibility.optional(),
  bonuses: z.boolean().optional(),
});

export const setWatchingArgs = z.tuple([z.string().max(64), z.boolean()]);

export const botLevel = z.enum(BOT_LEVEL_IDS);

export const playerId = z.string().max(64);

export function typedArgs(maxKeys: number) {
  return z.tuple([z.number().int().min(0), z.string().max(maxKeys)]);
}

/**
 * Socket.IO hands a handler whatever the client put last, which is only a
 * function when the client asked for an answer. Anything else is replaced, so
 * answering can't throw.
 */
export function ackOf<T>(ack: unknown): (reply: T) => void {
  return typeof ack === "function" ? (reply: T) => ack(reply) : () => {};
}

// HTTP API (server/api.ts)

export const credentials = z.object({
  username: z.string({ error: code("username-format") }).trim().regex(USERNAME_RE, code("username-format")),
  password: z
    .string({ error: code("password-short") })
    .min(MIN_PASSWORD, code("password-short"))
    .max(MAX_PASSWORD),
});

export const signupBody = credentials.extend({
  displayName: z.string().max(64).optional(),
});

export const displayNameBody = z.object({
  displayName: riderName,
});

export const loginBody = z.object({
  username: z.string().trim().max(64),
  password: z.string().max(MAX_PASSWORD),
});

export const mountBody = z.object({
  username: z.string().trim().max(64),
  mount: z.string({ error: code("which-mount") }).trim().min(1, code("which-mount")).max(32),
  revoke: z.boolean().optional(),
});

export const newRoomBody = z.object({
  visibility: visibility.optional(),
});

export const historyQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const raceId = z.coerce.number().int().min(1).max(2_147_483_647);

export const textQuery = z.object({
  lang: language.optional(),
  kind: textKind.optional(),
});

export const oauthCallbackQuery = z.object({
  code: z.string().max(1024).optional(),
  state: z.string().max(256).optional(),
  error: z.string().max(256).optional(),
});

/** A URL's query string as a plain object, for the query schemas. */
export function queryOf(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams);
}
