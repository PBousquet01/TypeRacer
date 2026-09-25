// Everything that has to outlive a server restart lives in PostgreSQL:
// accounts, sessions, unlocked mounts and race results.
//
// Bun talks to Postgres natively (Bun.SQL), so there's no database driver to
// install. Queries are tagged templates — values are sent as parameters, so
// they can't be read as SQL.
import { SQL } from "bun";

const url =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/chocobo_race";

export const sql = new SQL(url);

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
];

/** Creates anything that's missing. Safe to run on every boot. */
export async function migrate(): Promise<void> {
  for (const statement of STATEMENTS) {
    await sql.unsafe(statement);
  }
}

export default sql;
