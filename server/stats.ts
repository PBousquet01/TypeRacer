// Writing race results down. A race is kept when at least one signed-in rider
// finished it: the whole field as the results screen showed it (HIST-02), and
// one row per signed-in finisher for their stats and history. Guests race
// exactly as before; their results just aren't kept as their own.
import { db } from "./db";
import { raceRuns, races } from "./schema";
import type { Player, Room } from "./rooms";
import type { PublicPlayer } from "../lib/types";

/**
 * `field` is the racers as everyone saw them on the results screen;
 * `entries` the same racers on the server, with who is signed in.
 */
export async function recordRace(room: Room, field: PublicPlayer[], entries: [string, Player][]): Promise<void> {
  const signedIn = entries.filter(([, p]) => p.userId && p.finished);
  if (signedIn.length === 0) return;
  await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(raceRuns)
      .values({ roomCode: room.code, bonuses: room.settings.bonuses, players: field })
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
  });
}
