#!/usr/bin/env bun
// Copies accounts from one PostgreSQL database to another: local → online.
//
// Password hashes move across untouched, so everyone's existing password
// still works. Sessions are not copied (people just sign in again). Safe to
// re-run: a username that already exists in the target is left alone, and
// its races are not copied a second time.
//
//   SOURCE_DATABASE_URL=<from> DATABASE_URL=<to> bun scripts/copy-accounts.ts [username…]
//
// With no usernames, every account is copied.
import { SQL } from "bun";
import { sql as target, migrate } from "../server/db";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
if (!sourceUrl || !process.env.DATABASE_URL) {
  console.error("Set SOURCE_DATABASE_URL (copy from) and DATABASE_URL (copy to).");
  process.exit(1);
}
if (sourceUrl === process.env.DATABASE_URL) {
  console.error("Source and target are the same database.");
  process.exit(1);
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: boolean;
  created_at: Date;
}
interface RaceRow {
  room_code: string;
  wpm: number;
  accuracy: number | null;
  score: number | null;
  time_ms: number | null;
  place: number | null;
  riders: number;
  finished_at: Date;
}

const only = process.argv.slice(2).map((name) => name.toLowerCase());
const source = new SQL(sourceUrl);

await migrate(); // make sure the target has its tables

const users: UserRow[] = await source`
  SELECT id, username, display_name, password_hash, is_admin, created_at FROM users ORDER BY id`;
const wanted = only.length ? users.filter((u) => only.includes(u.username.toLowerCase())) : users;
const missing = only.filter((name) => !users.some((u) => u.username.toLowerCase() === name));
if (missing.length) console.log(`not found in the source: ${missing.join(", ")}`);

for (const user of wanted) {
  const [existing]: { id: number }[] = await target`
    SELECT id FROM users WHERE lower(username) = lower(${user.username})`;
  if (existing) {
    console.log(`${user.username.padEnd(16)} already exists in the target: skipped`);
    continue;
  }

  const [created]: { id: number }[] = await target`
    INSERT INTO users (username, display_name, password_hash, is_admin, created_at)
    VALUES (${user.username}, ${user.display_name}, ${user.password_hash}, ${user.is_admin}, ${user.created_at})
    RETURNING id`;

  const unlocks: { mount: string }[] = await source`SELECT mount FROM unlocks WHERE user_id = ${user.id}`;
  for (const { mount } of unlocks) {
    await target`INSERT INTO unlocks (user_id, mount) VALUES (${created.id}, ${mount}) ON CONFLICT DO NOTHING`;
  }

  const races: RaceRow[] = await source`
    SELECT room_code, wpm, accuracy, score, time_ms, place, riders, finished_at
      FROM races WHERE user_id = ${user.id} ORDER BY id`;
  for (const r of races) {
    await target`
      INSERT INTO races (user_id, room_code, wpm, accuracy, score, time_ms, place, riders, finished_at)
      VALUES (${created.id}, ${r.room_code}, ${r.wpm}, ${r.accuracy}, ${r.score}, ${r.time_ms},
              ${r.place}, ${r.riders}, ${r.finished_at})`;
  }

  console.log(
    `${user.username.padEnd(16)} copied${user.is_admin ? " (admin)" : ""}: ` +
      `${races.length} race${races.length === 1 ? "" : "s"}, ${unlocks.length} mount${unlocks.length === 1 ? "" : "s"}`,
  );
}

await source.end();
await target.end();
