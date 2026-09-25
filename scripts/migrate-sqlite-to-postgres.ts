#!/usr/bin/env bun
// One-off: copies the old SQLite database into PostgreSQL.
//
// Password hashes move across untouched, so everyone's existing password
// still works. Safe to re-run: accounts that already exist are skipped.
//
//   bun scripts/migrate-sqlite-to-postgres.ts [path/to/chocobo.sqlite]
import { Database } from "bun:sqlite";
import { sql, migrate } from "../server/db";

interface OldUser {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  created_at: string | null;
}
interface OldUnlock {
  user_id: number;
  mount: string;
}
interface OldRace {
  user_id: number;
  room_code: string;
  wpm: number;
  accuracy: number | null;
  time_ms: number | null;
  place: number | null;
  riders: number;
  finished_at: string;
}

const file = process.argv[2] ?? "data/chocobo.sqlite";
const old = new Database(file, { readonly: true });

await migrate();

const users = old.query<OldUser, []>("SELECT * FROM users ORDER BY id").all();
const unlocks = old.query<OldUnlock, []>("SELECT * FROM unlocks").all();
const races = old.query<OldRace, []>("SELECT * FROM races ORDER BY id").all();
console.log(`found ${users.length} accounts, ${unlocks.length} unlocks, ${races.length} races`);

// old sqlite id -> new postgres id
const idMap = new Map<number, number>();
let copied = 0;
let skipped = 0;

for (const u of users) {
  const [existing] = await sql`
    SELECT id FROM users WHERE lower(username) = lower(${u.username})`;
  if (existing) {
    idMap.set(u.id, existing.id);
    skipped++;
    continue;
  }
  const [row] = await sql`
    INSERT INTO users (username, display_name, password_hash, is_admin, created_at)
    VALUES (${u.username}, ${u.display_name}, ${u.password_hash},
            ${Boolean(u.is_admin)}, ${u.created_at ?? new Date().toISOString()})
    RETURNING id`;
  idMap.set(u.id, row.id);
  copied++;
}

for (const g of unlocks) {
  const userId = idMap.get(g.user_id);
  if (!userId) continue;
  await sql`
    INSERT INTO unlocks (user_id, mount) VALUES (${userId}, ${g.mount})
    ON CONFLICT DO NOTHING`;
}

// Races are only copied for accounts that were created by this run, so
// re-running doesn't duplicate anyone's history.
let raceRows = 0;
for (const r of races) {
  const userId = idMap.get(r.user_id);
  if (!userId) continue;
  const [dupe] = await sql`
    SELECT id FROM races
     WHERE user_id = ${userId} AND room_code = ${r.room_code}
       AND wpm = ${r.wpm} AND finished_at = ${r.finished_at}`;
  if (dupe) continue;
  await sql`
    INSERT INTO races (user_id, room_code, wpm, accuracy, time_ms, place, riders, finished_at)
    VALUES (${userId}, ${r.room_code}, ${r.wpm}, ${r.accuracy}, ${r.time_ms},
            ${r.place}, ${r.riders}, ${r.finished_at})`;
  raceRows++;
}

console.log(`accounts copied: ${copied}, already there: ${skipped}`);
console.log(`unlocks copied: ${unlocks.length}, races copied: ${raceRows}`);
old.close();
await sql.end();
