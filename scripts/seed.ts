// Demo data (TECH-04): the text bank, a few accounts and their race history.
//
//   SEED_PASSWORD=... bun run db:seed
//
// Safe to run twice: existing accounts are left alone, and history is only
// added to an account that has none. Without SEED_PASSWORD, a random password
// is made and printed once.
import { count, eq, sql } from "drizzle-orm";
import { db, migrate, sql as connection } from "../server/db";
import { races, users } from "../server/schema";

const RIDERS = [
  { username: "demo", displayName: "Demo", wpm: 55 },
  { username: "boko", displayName: "Boko", wpm: 72 },
  { username: "mog", displayName: "Mog", wpm: 38 },
];
const RACES_EACH = 15;

await migrate(); // tables and the text bank

const password = process.env.SEED_PASSWORD || crypto.randomUUID().slice(0, 12);
const hash = await Bun.password.hash(password);

// Same seed, same history: a tiny PRNG instead of Math.random.
let state = 20261002;
let created = 0;
const random = () => {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
};

for (const rider of RIDERS) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${rider.username}`);

  const id =
    existing?.id ??
    (await db
      .insert(users)
      .values({ username: rider.username, displayName: rider.displayName, passwordHash: hash })
      .returning({ id: users.id }))[0].id;
  if (!existing) {
    created++;
    console.log(`account ${rider.username} created`);
  }

  const [{ n }] = await db.select({ n: count() }).from(races).where(eq(races.userId, id));
  if (n > 0) continue;

  // One race every two days, getting a little faster over the month.
  const history = Array.from({ length: RACES_EACH }, (_, i) => {
    const wpm = Math.round(rider.wpm * (0.85 + (0.2 * i) / RACES_EACH) + (random() - 0.5) * 8);
    const accuracy = Math.round(90 + random() * 9);
    const riders = 2 + Math.floor(random() * 6);
    return {
      userId: id,
      roomCode: "DEMO" + String(i).padStart(2, "0"),
      wpm,
      accuracy,
      score: Math.round((wpm * accuracy) / 100),
      timeMs: Math.round(((250 / 5) * 60_000) / wpm), // a 250-character text
      place: 1 + Math.floor(random() * riders),
      riders,
      finishedAt: new Date(Date.now() - (RACES_EACH - i) * 2 * 86_400_000),
    };
  });
  await db.insert(races).values(history);
  console.log(`${history.length} races added for ${rider.username}`);
}

if (created > 0 && !process.env.SEED_PASSWORD) {
  console.log(`password for new demo accounts: ${password}`);
}
await connection.end();
