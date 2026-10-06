// The database schema (TECH-04). Drizzle Kit reads this file to write the
// migrations in drizzle/; never change the database by hand, change this file
// and run `bun run db:generate`.
//
// Constraint and index names are spelled out so they match the tables created
// before migrations existed (see adoptLegacyDatabase in server/db.ts).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Provider, PublicPlayer, TextLanguage } from "../lib/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    // Null for someone who only signs in with GitHub or Discord.
    passwordHash: text("password_hash"),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: createdAt(),
  },
  // Usernames are case-insensitive: "Phil" and "phil" are the same account.
  (t) => [uniqueIndex("users_username_lower").on(sql`lower(${t.username})`)],
);

// GitHub and Discord accounts attached to a user, at most one of each.
export const identities = pgTable(
  "identities",
  {
    provider: text("provider").$type<Provider>().notNull(),
    providerId: text("provider_id").notNull(),
    userId: integer("user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "identities_pkey", columns: [t.provider, t.providerId] }),
    unique("identities_user_id_provider_key").on(t.userId, t.provider),
    check("identities_provider_check", sql`${t.provider} IN ('github', 'discord')`),
    foreignKey({ name: "identities_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("sessions_by_user").on(t.userId),
    foreignKey({ name: "sessions_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  ],
);

// Mounts that aren't available to everyone, granted per account.
export const unlocks = pgTable(
  "unlocks",
  {
    userId: integer("user_id").notNull(),
    mount: text("mount").notNull(),
  },
  (t) => [
    primaryKey({ name: "unlocks_pkey", columns: [t.userId, t.mount] }),
    foreignKey({ name: "unlocks_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  ],
);

// HIST-02: one row per race that has at least one signed-in finisher: the
// whole field's results as they were on the results screen, so the page can
// be shown again (guests and bots included).
export const raceRuns = pgTable("race_runs", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  bonuses: boolean("bonuses").notNull().default(false),
  players: jsonb("players").$type<PublicPlayer[]>().notNull(),
});

// One row per finished race, per signed-in rider.
export const races = pgTable(
  "races",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    roomCode: text("room_code").notNull(),
    wpm: integer("wpm").notNull(),
    accuracy: integer("accuracy"),
    timeMs: integer("time_ms"),
    place: integer("place"),
    riders: integer("riders").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    score: integer("score"),
    // RES-05: what the results charts need to be drawn again later.
    wpmSamples: integer("wpm_samples").array(),
    missedKeys: jsonb("missed_keys").$type<Record<string, number>>(),
    // HIST-02: the race this row belongs to, and which rider of its field it is.
    runId: integer("run_id"),
    playerId: text("player_id"),
  },
  (t) => [
    index("races_by_user").on(t.userId, t.finishedAt.desc().nullsFirst()),
    foreignKey({ name: "races_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    foreignKey({ name: "races_run_id_fkey", columns: [t.runId], foreignColumns: [raceRuns.id] }).onDelete("set null"),
  ],
);

// AUTH-04: one profile photo per account, already resized (256 x 256 WebP).
// Kept in the database: the host's disk doesn't survive a restart.
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const avatars = pgTable(
  "avatars",
  {
    userId: integer("user_id").primaryKey(),
    image: bytea("image").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "avatars_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  ],
);

// The passages to type. The bank starts from server/seed/ and grows with
// `bun scripts/admin.ts add-text`.
export const passages = pgTable(
  "passages",
  {
    id: serial("id").primaryKey(),
    language: text("language").$type<TextLanguage>().notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("passages_by_language").on(t.language),
    check("passages_language_check", sql`${t.language} IN ('en', 'fr')`),
  ],
);

// The dictionary that "random words" races are drawn from.
export const words = pgTable(
  "words",
  {
    language: text("language").$type<TextLanguage>().notNull(),
    word: text("word").notNull(),
  },
  (t) => [
    primaryKey({ name: "words_pkey", columns: [t.language, t.word] }),
    check("words_language_check", sql`${t.language} IN ('en', 'fr')`),
  ],
);

// SALLE-06: who is in which room, one row per person, so the primary key
// guarantees nobody is in two rooms at once (server/members.ts). A person is
// "u:<user id>" for an account, "g:<guest id>" for a guest's signed cookie.
export const roomMembers = pgTable("room_members", {
  person: text("person").primaryKey(),
  roomCode: text("room_code").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});
