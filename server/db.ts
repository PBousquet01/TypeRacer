// Everything that has to outlive a server restart lives in PostgreSQL:
// accounts, sessions, unlocked mounts and race results.
//
// Bun talks to Postgres natively (Bun.SQL), so there's no database driver to
// install. Queries are tagged templates — values are sent as parameters, so
// they can't be read as SQL.
import { SQL } from "bun";

const url =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/chocobo_race";

// Hosted databases (Neon) put themselves to sleep after a few idle minutes
// and take a moment to wake. So: don't hold idle connections open (they'd be
// dead after a sleep), and give a waking database time to answer.
export const sql = new SQL({
  url,
  idleTimeout: 30, // seconds
  connectionTimeout: 30, // seconds
});

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id            SERIAL PRIMARY KEY,
     username      TEXT NOT NULL,
     display_name  TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     is_admin      BOOLEAN NOT NULL DEFAULT false,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Usernames are case-insensitive: "Phil" and "phil" are the same account.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower
     ON users (lower(username))`,

  // AUTH-1/2/3: GitHub and Discord accounts attached to a user, at most one
  // of each. Someone who only ever signs in that way has no password.
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS identities (
     provider    TEXT NOT NULL CHECK (provider IN ('github', 'discord')),
     provider_id TEXT NOT NULL,
     user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (provider, provider_id),
     UNIQUE (user_id, provider)
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     token      TEXT PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     expires_at TIMESTAMPTZ NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id)`,

  // Mounts that aren't available to everyone (the fox, Miku, and the rest of
  // the in-jokes) are granted per account here.
  `CREATE TABLE IF NOT EXISTS unlocks (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mount   TEXT NOT NULL,
     PRIMARY KEY (user_id, mount)
   )`,

  // One row per finished race, per signed-in rider.
  `CREATE TABLE IF NOT EXISTS races (
     id          SERIAL PRIMARY KEY,
     user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     room_code   TEXT NOT NULL,
     wpm         INTEGER NOT NULL,
     accuracy    INTEGER,
     time_ms     INTEGER,
     place       INTEGER,
     riders      INTEGER NOT NULL,
     finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS races_by_user ON races (user_id, finished_at DESC)`,
  // TXT-9: wpm × accuracy. Races saved before the column existed get theirs
  // worked out once, from the numbers they already have.
  `ALTER TABLE races ADD COLUMN IF NOT EXISTS score INTEGER`,
  `UPDATE races SET score = ROUND(wpm * accuracy / 100.0) WHERE score IS NULL AND accuracy IS NOT NULL`,

  // TXT-3: the passages to type live here, not in the code. The bank starts
  // from server/seed/ and grows with `bun scripts/admin.ts add-text`.
  `CREATE TABLE IF NOT EXISTS passages (
     id         SERIAL PRIMARY KEY,
     language   TEXT NOT NULL CHECK (language IN ('en', 'fr')),
     body       TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS passages_by_language ON passages (language)`,

  // The dictionary that "random words" races are drawn from.
  `CREATE TABLE IF NOT EXISTS words (
     language TEXT NOT NULL CHECK (language IN ('en', 'fr')),
     word     TEXT NOT NULL,
     PRIMARY KEY (language, word)
   )`,
];

/** Creates anything that's missing. Safe to run on every boot. */
export async function migrate(): Promise<void> {
  for (const statement of STATEMENTS) {
    await sql.unsafe(statement);
  }
  await seedTexts();
}

const LANGUAGES = ["en", "fr"] as const;

// Fills an empty text bank from server/seed/. Only runs when a language has
// nothing at all, so passages added or deleted later are left alone.
async function seedTexts(): Promise<void> {
  const seed: Record<string, string[]> = await Bun.file(new URL("./seed/passages.json", import.meta.url)).json();

  for (const language of LANGUAGES) {
    const [{ count: passages }]: { count: number }[] = await sql`
      SELECT COUNT(*)::int AS count FROM passages WHERE language = ${language}`;
    if (passages === 0) {
      for (const body of seed[language] ?? []) {
        await sql`INSERT INTO passages (language, body) VALUES (${language}, ${body})`;
      }
    }

    const [{ count: words }]: { count: number }[] = await sql`
      SELECT COUNT(*)::int AS count FROM words WHERE language = ${language}`;
    if (words === 0) {
      const list = (await Bun.file(new URL(`./seed/words-${language}.txt`, import.meta.url)).text())
        .split(/\s+/)
        .filter(Boolean);
      for (const word of list) {
        await sql`INSERT INTO words (language, word) VALUES (${language}, ${word}) ON CONFLICT DO NOTHING`;
      }
    }
  }
}

export default sql;
