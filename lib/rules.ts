// Race rules both sides need: the server enforces them, the lobby shows them.
export const MIN_RIDERS = 2; // COURSE-3: a race needs at least two riders
export const MAX_RIDERS = 40; // COURSE-4: a full class (35) with room to spare (H-2)
export const FINISH_GRACE_MS = 30_000; // COURSE-15: once someone finishes, the rest get this long (H-3)
export const RECONNECT_MS = 30_000; // COURSE-14: how long a dropped rider's lane is kept for them

// SALLE-02: six characters, none that can be mistaken for another (0/O, 1/I/L).
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_CHARS}]{${ROOM_CODE_LENGTH}}$`);

/** What someone typed or pasted, as a room code: capitals, spaces and dashes dropped. */
export function normalizeRoomCode(input: unknown): string {
  return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

/** RES-02: how a rider's race ended. */
export type RaceStatus = "finished" | "timeout" | "abandoned";

/**
 * A rider who reached the end finished; one still there when the race ended
 * ran out of time; one who had left (their lane held, or given up) abandoned.
 */
export function raceStatus({ finished, away }: { finished: boolean; away: boolean }): RaceStatus {
  if (finished) return "finished";
  return away ? "abandoned" : "timeout";
}

/** RES-02, annex A: raw WPM counts every key typed, right or wrong. */
export function rawWpmOf(keystrokes: number, elapsedMs: number): number {
  return elapsedMs >= 1000 ? Math.round(keystrokes / 5 / (elapsedMs / 60000)) : 0;
}

/** TXT-9: the score that decides the ranking. 60 wpm at 90% → 54. */
export function scoreOf(wpm: number, accuracy: number): number {
  return Math.round((wpm * accuracy) / 100);
}
