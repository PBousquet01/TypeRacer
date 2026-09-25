#!/usr/bin/env bun
// Account admin from the terminal — the only way to create the first admin,
// since nobody can grant themselves that.
//
//   bun scripts/admin.ts list
//   bun scripts/admin.ts make-admin <username>
//   bun scripts/admin.ts grant <username> <mount>
//   bun scripts/admin.ts revoke <username> <mount>
//   bun scripts/admin.ts stats <username>
//   bun scripts/admin.ts texts [en|fr]
//   bun scripts/admin.ts add-text <en|fr> "<passage>"
//   bun scripts/admin.ts delete-text <id>
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
  case "texts": {
    const language = username; // optional filter
    const rows: { id: number; language: string; body: string }[] = language
      ? await sql`SELECT id, language, body FROM passages WHERE language = ${language} ORDER BY id`
      : await sql`SELECT id, language, body FROM passages ORDER BY language, id`;
    for (const r of rows) console.log(`${String(r.id).padStart(4)}  ${r.language}  ${r.body.slice(0, 90)}${r.body.length > 90 ? "…" : ""}`);
    const counts: { language: string; passages: number; words: number }[] = await sql`
      SELECT l.language,
             (SELECT COUNT(*)::int FROM passages p WHERE p.language = l.language) AS passages,
             (SELECT COUNT(*)::int FROM words w WHERE w.language = l.language) AS words
        FROM (VALUES ('en'), ('fr')) AS l(language)`;
    for (const c of counts) console.log(`${c.language}: ${c.passages} passages, ${c.words} dictionary words`);
    break;
  }
  case "add-text": {
    const language = username;
    const body = String(process.argv.slice(4).join(" ")).replace(/\s+/g, " ").trim();
    if (language !== "en" && language !== "fr") {
      console.error('The language is "en" or "fr".');
      process.exit(1);
    }
    if (body.length < 40) {
      console.error("A passage needs at least 40 characters.");
      process.exit(1);
    }
    const [row]: { id: number }[] = await sql`
      INSERT INTO passages (language, body) VALUES (${language}, ${body}) RETURNING id`;
    console.log(`Added passage ${row.id} (${language}, ${body.length} characters).`);
    break;
  }
  case "delete-text": {
    const id = Number(username);
    const deleted = await sql`DELETE FROM passages WHERE id = ${id} RETURNING id`;
    console.log(deleted.length ? `Deleted passage ${id}.` : `No passage with id ${username}.`);
    break;
  }
  default:
    console.log(`Usage:\n  bun scripts/admin.ts list\n  bun scripts/admin.ts create <username> [rider name] [password]\n  bun scripts/admin.ts delete <username>\n  bun scripts/admin.ts make-admin <username>\n  bun scripts/admin.ts grant <username> <mount>\n  bun scripts/admin.ts revoke <username> <mount>\n  bun scripts/admin.ts stats <username>\n  bun scripts/admin.ts texts [en|fr]\n  bun scripts/admin.ts add-text <en|fr> "<passage>"\n  bun scripts/admin.ts delete-text <id>`);
}

await sql.end();
