#!/usr/bin/env bun
// Account admin from the terminal — the only way to create the first admin,
// since nobody can grant themselves that.
//
//   bun scripts/admin.ts list
//   bun scripts/admin.ts make-admin <username>
//   bun scripts/admin.ts grant <username> <mount>
//   bun scripts/admin.ts revoke <username> <mount>
//   bun scripts/admin.ts stats <username>
import { randomBytes } from "node:crypto";
import { sql } from "../server/db";
import { createUser, findUserByUsername, grantMount, revokeMount, validateCredentials } from "../server/auth";
import { migrate } from "../server/db";
import type { User } from "../lib/types";

await migrate(); // so the CLI works against a fresh database too

/** A password that's strong but still readable down a phone line. */
function makePassword() {
  const words = ["chocobo", "gysahl", "marsh", "feather", "saddle", "gallop", "kweh", "stable",
                 "lantern", "meadow", "thunder", "clover", "harbour", "amber", "willow", "pebble"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const digits = String(100 + (randomBytes(2).readUInt16BE() % 900));
  return `${pick()}-${pick()}-${digits}`;
}

const [command, username, mount] = process.argv.slice(2);

async function needUser(): Promise<User> {
  const user = await findUserByUsername(username);
  if (!user) {
    console.error(`No account called "${username}".`);
    process.exit(1);
  }
  return user;
}

switch (command) {
  case "list": {
    const rows = await sql`
      SELECT users.username, users.display_name AS name, users.is_admin AS admin,
             (SELECT COUNT(*)::int FROM races WHERE races.user_id = users.id) AS races,
             (SELECT string_agg(mount, ',' ORDER BY mount) FROM unlocks
               WHERE unlocks.user_id = users.id) AS unlocks
        FROM users ORDER BY users.id`;
    if (!rows.length) console.log("No accounts yet.");
    for (const r of rows as { username: string; name: string; admin: boolean; races: number; unlocks: string | null }[]) {
      console.log(
        `${r.username.padEnd(16)} ${r.name.padEnd(16)} ${r.admin ? "admin" : "     "}  ` +
          `${String(r.races).padStart(3)} races  unlocks: ${r.unlocks ?? "—"}`,
      );
    }
    break;
  }
  case "create": {
    const displayName = process.argv[4] ?? username;
    const password = process.argv[5] ?? makePassword();
    const problem = validateCredentials(username, password);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    const created = await createUser({ username, password, displayName });
    if ("error" in created) {
      console.error(created.error);
      process.exit(1);
    }
    const { user } = created;
    console.log(`Created ${user.username} (rider name "${user.displayName}")`);
    console.log(`Password: ${password}`);
    break;
  }
  case "delete": {
    const user = await needUser();
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    console.log(`Deleted ${user.username} and everything attached to it.`);
    break;
  }
  case "make-admin": {
    const user = await needUser();
    await sql`UPDATE users SET is_admin = true WHERE id = ${user.id}`;
    console.log(`${user.username} is now an admin.`);
    break;
  }
  case "grant": {
    const user = await needUser();
    await grantMount(user.id, mount ?? "");
    console.log(`${user.username} unlocked "${mount}".`);
    break;
  }
  case "revoke": {
    const user = await needUser();
    await revokeMount(user.id, mount ?? "");
    console.log(`${user.username} lost "${mount}".`);
    break;
  }
  case "stats": {
    const user = await needUser();
    const rows = await sql`
      SELECT room_code, wpm, accuracy, place, riders,
             to_char(finished_at, 'YYYY-MM-DD HH24:MI') AS finished_at
        FROM races WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 10`;
    console.log(`Last ${rows.length} races for ${user.username}:`);
    for (const r of rows as { room_code: string; wpm: number; accuracy: number | null; place: number; riders: number; finished_at: string }[]) {
      console.log(`  ${r.finished_at}  room ${r.room_code}  ${r.wpm} wpm  ` +
                  `${r.accuracy ?? "—"}%  #${r.place}/${r.riders}`);
    }
    break;
  }
  default:
    console.log(`Usage:\n  bun scripts/admin.ts list\n  bun scripts/admin.ts create <username> [rider name] [password]\n  bun scripts/admin.ts delete <username>\n  bun scripts/admin.ts make-admin <username>\n  bun scripts/admin.ts grant <username> <mount>\n  bun scripts/admin.ts revoke <username> <mount>\n  bun scripts/admin.ts stats <username>`);
}

await sql.end();
