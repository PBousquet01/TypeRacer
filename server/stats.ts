// Writing race results down. Only signed-in riders get a row; guests race
// exactly as before, their results just aren't kept.
import { sql } from "./db";
import type { Player, Room } from "./rooms";

export async function recordRace(room: Room, player: Player): Promise<void> {
  if (!player.userId || !player.finished) return; // guests and DNFs aren't recorded
  const riders = [...room.players.values()].filter((p) => p.racing).length;
  await sql`
    INSERT INTO races (user_id, room_code, wpm, accuracy, time_ms, place, riders)
    VALUES (${player.userId}, ${room.code}, ${player.wpm ?? 0}, ${player.accuracy ?? null},
            ${player.timeMs ?? null}, ${player.place ?? null}, ${riders})`;
}
