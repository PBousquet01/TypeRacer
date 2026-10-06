// SALLE-06: one room per person, guaranteed by the database. `room_members`
// has one row per person (primary key), naming the room they are in. Rooms
// themselves live in memory (server/rooms.ts); this table is the lock.
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { roomMembers } from "./schema";

/**
 * Puts `person` in room `code`. Returns null when it worked (they were in no
 * room, or already in this one), or the code of the room they are in. With
 * `force`, moves them out of that other room's row; the caller removes them
 * from the room itself.
 */
export async function claimRoom(person: string, code: string, force = false): Promise<string | null> {
  const [row] = await db
    .insert(roomMembers)
    .values({ person, roomCode: code })
    .onConflictDoUpdate({
      target: roomMembers.person,
      set: { roomCode: code, joinedAt: sql`now()` },
      setWhere: force ? undefined : eq(roomMembers.roomCode, code),
    })
    .returning({ roomCode: roomMembers.roomCode });
  if (row) return null;
  const [current] = await db.select({ roomCode: roomMembers.roomCode }).from(roomMembers).where(eq(roomMembers.person, person));
  // Gone between the two queries: try again, now that the place is free.
  return current ? current.roomCode : claimRoom(person, code, force);
}

/** Takes `person` out of room `code`. A row naming another room is left alone. */
export async function releaseRoom(person: string, code: string): Promise<void> {
  await db.delete(roomMembers).where(and(eq(roomMembers.person, person), eq(roomMembers.roomCode, code)));
}

/** Rooms don't survive a restart, so neither do their members. */
export async function clearRoomMembers(): Promise<void> {
  await db.delete(roomMembers);
}
