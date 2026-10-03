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
import { asc, countDistinct, desc, eq, sql } from "drizzle-orm";
import { db, migrate, sql as connection } from "../server/db";
import { passages, races, unlocks, users, words } from "../server/schema";
import { createUser, findUserByUsername, grantMount, revokeMount, validateCredentials } from "../server/auth";
import { isLanguage } from "../server/texts";
import type { User } from "../lib/types";
import { en } from "../lib/i18n/en";

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
    const rows = await db
      .select({
        username: users.username,
        name: users.displayName,
        admin: users.isAdmin,
        races: countDistinct(races.id),
        unlocks: sql<string | null>`string_agg(distinct ${unlocks.mount}, ',' order by ${unlocks.mount})`,
      })
      .from(users)
      .leftJoin(races, eq(races.userId, users.id))
      .leftJoin(unlocks, eq(unlocks.userId, users.id))
      .groupBy(users.id)
      .orderBy(users.id);
    if (!rows.length) console.log("No accounts yet.");
    for (const r of rows) {
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
      console.error(en.errors[problem]);
      process.exit(1);
    }
    const created = await createUser({ username, password, displayName });
    if ("error" in created) {
      console.error(en.errors[created.error]);
      process.exit(1);
    }
    const { user } = created;
    console.log(`Created ${user.username} (rider name "${user.displayName}")`);
    console.log(`Password: ${password}`);
    break;
  }
  case "delete": {
    const user = await needUser();
    await db.delete(users).where(eq(users.id, user.id));
    console.log(`Deleted ${user.username} and everything attached to it.`);
    break;
  }
  case "make-admin": {
    const user = await needUser();
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
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
    const rows = await db
      .select({
        roomCode: races.roomCode,
        wpm: races.wpm,
        accuracy: races.accuracy,
        place: races.place,
        riders: races.riders,
        finishedAt: sql<string>`to_char(${races.finishedAt}, 'YYYY-MM-DD HH24:MI')`,
      })
      .from(races)
      .where(eq(races.userId, user.id))
      .orderBy(desc(races.id))
      .limit(10);
    console.log(`Last ${rows.length} races for ${user.username}:`);
    for (const r of rows) {
      console.log(`  ${r.finishedAt}  room ${r.roomCode}  ${r.wpm} wpm  ` +
                  `${r.accuracy ?? "—"}%  #${r.place}/${r.riders}`);
    }
    break;
  }
  case "texts": {
    const language = username; // optional filter
    const rows = await db
      .select({ id: passages.id, language: passages.language, body: passages.body })
      .from(passages)
      .where(isLanguage(language) ? eq(passages.language, language) : undefined)
      .orderBy(asc(passages.language), asc(passages.id));
    for (const r of rows) console.log(`${String(r.id).padStart(4)}  ${r.language}  ${r.body.slice(0, 90)}${r.body.length > 90 ? "…" : ""}`);
    for (const lang of ["en", "fr"] as const) {
      const p = await db.$count(passages, eq(passages.language, lang));
      const w = await db.$count(words, eq(words.language, lang));
      console.log(`${lang}: ${p} passages, ${w} dictionary words`);
    }
    break;
  }
  case "add-text": {
    const language = username;
    const body = String(process.argv.slice(4).join(" ")).replace(/\s+/g, " ").trim();
    if (!isLanguage(language)) {
      console.error('The language is "en" or "fr".');
      process.exit(1);
    }
    if (body.length < 40) {
      console.error("A passage needs at least 40 characters.");
      process.exit(1);
    }
    const [row] = await db.insert(passages).values({ language, body }).returning({ id: passages.id });
    console.log(`Added passage ${row.id} (${language}, ${body.length} characters).`);
    break;
  }
  case "delete-text": {
    const id = Number(username);
    const deleted = await db.delete(passages).where(eq(passages.id, id)).returning({ id: passages.id });
    console.log(deleted.length ? `Deleted passage ${id}.` : `No passage with id ${username}.`);
    break;
  }
  default:
    console.log(`Usage:\n  bun scripts/admin.ts list\n  bun scripts/admin.ts create <username> [rider name] [password]\n  bun scripts/admin.ts delete <username>\n  bun scripts/admin.ts make-admin <username>\n  bun scripts/admin.ts grant <username> <mount>\n  bun scripts/admin.ts revoke <username> <mount>\n  bun scripts/admin.ts stats <username>\n  bun scripts/admin.ts texts [en|fr]\n  bun scripts/admin.ts add-text <en|fr> "<passage>"\n  bun scripts/admin.ts delete-text <id>`);
}

await connection.end();
