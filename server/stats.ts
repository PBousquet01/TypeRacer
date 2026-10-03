// Writing race results down. Only signed-in riders get a row; guests race
// exactly as before, their results just aren't kept.
import { db } from "./db";
import { races } from "./schema";
import type { Player, Room } from "./rooms";

export async function recordRace(room: Room, player: Player): Promise<void> {
  if (!player.userId || !player.finished) return; // guests and DNFs aren't recorded
  const riders = [...room.players.values()].filter((p) => p.racing).length;
  await db.insert(races).values({
    userId: player.userId,
    roomCode: room.code,
    wpm: player.wpm ?? 0,
    accuracy: player.accuracy ?? null,
    score: player.score ?? null,
    timeMs: player.timeMs ?? null,
    place: player.place ?? null,
    riders,
    wpmSamples: player.samples,
    missedKeys: player.missed,
  });
}
