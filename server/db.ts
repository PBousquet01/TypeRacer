// Everything that has to outlive a server restart lives in PostgreSQL:
// accounts, sessions, unlocked mounts and race results.
//
// Bun talks to Postgres natively (Bun.SQL), so there's no database driver to
// install. Queries are tagged templates — values are sent as parameters, so
// they can't be read as SQL. Drizzle (`db`) shares the same connection; the
// schema lives in server/schema.ts and its history in drizzle/ (TECH-04).
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate as runMigrations } from "drizzle-orm/bun-sql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

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

export const db = drizzle({ client: sql, schema });

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies any migration in drizzle/ the database hasn't seen, then makes sure there are texts to type. */
export async function migrate(): Promise<void> {
  await adoptLegacyDatabase();
  await runMigrations(db, { migrationsFolder: MIGRATIONS });
  await seedTexts();
}

// Databases created before migrations existed (the local one, and Neon in
// production) already have every table of the baseline migration, built by
// the old CREATE TABLE IF NOT EXISTS list. Running the baseline on them would
// fail, so they're recorded as already being at the baseline instead. The
// baseline's constraint and index names match the old ones, so the result is
// the same as a fresh database.
async function adoptLegacyDatabase(): Promise<void> {
  const [{ legacy, tracked }]: { legacy: boolean; tracked: boolean }[] = await sql`
    SELECT to_regclass('public.users') IS NOT NULL AS legacy,
           to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS tracked`;
  if (!legacy || tracked) return;

  const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS });
  await sql.begin(async (tx) => {
    await tx`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await tx`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
               id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
    await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
             VALUES (${baseline.hash}, ${baseline.folderMillis})`;
  });
}

const LANGUAGES = ["en", "fr"] as const;

// Fills an empty text bank from server/seed/. Only runs when a language has
// nothing at all, so passages added or deleted later are left alone.
export async function seedTexts(): Promise<void> {
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
