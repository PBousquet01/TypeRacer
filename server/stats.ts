// Writing race results down. A race is kept when at least one signed-in rider
// finished it: the whole field as the results screen showed it (HIST-02), and
// one row per signed-in finisher for their stats and history. Guests race
// exactly as before; their results just aren't kept as their own.
import { eq, max } from "drizzle-orm";
import { db } from "./db";
import { raceRuns, races } from "./schema";
import type { Player, Room } from "./rooms";
import type { PublicPlayer } from "../lib/types";

/**
 * `field` is the racers as everyone saw them on the results screen;
 * `entries` the same racers on the server, with who is signed in.
 * Returns the ids of the riders who beat their best WPM (RES-04).
 */
export async function recordRace(room: Room, field: PublicPlayer[], entries: [string, Player][]): Promise<string[]> {
  const signedIn = entries.filter(([, p]) => p.userId && p.finished);
  if (signedIn.length === 0) return [];
  return db.transaction(async (tx) => {
    // RES-04: a record is beating your best WPM from earlier races. A first
    // race has nothing to beat, so it isn't one.
    const records: string[] = [];
    for (const [id, player] of signedIn) {
      const [{ best }] = await tx.select({ best: max(races.wpm) }).from(races).where(eq(races.userId, player.userId!));
      if (best !== null && (player.wpm ?? 0) > best) records.push(id);
    }
    const shown = field.map((p) => (records.includes(p.id) ? { ...p, personalBest: true } : p));
    const [run] = await tx
      .insert(raceRuns)
      .values({ roomCode: room.code, bonuses: room.settings.bonuses, players: shown })
      .returning({ id: raceRuns.id });
    await tx.insert(races).values(
      signedIn.map(([id, player]) => ({
        userId: player.userId!,
        roomCode: room.code,
        wpm: player.wpm ?? 0,
        accuracy: player.accuracy ?? null,
        score: player.score ?? null,
        timeMs: player.timeMs ?? null,
        place: player.place ?? null,
        riders: entries.length,
        wpmSamples: player.samples,
        missedKeys: player.missed,
        runId: run.id,
        playerId: id,
      })),
    );
    return records;
  });
}
