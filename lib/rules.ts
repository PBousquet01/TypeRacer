// Race rules both sides need: the server enforces them, the lobby shows them.
export const MIN_RIDERS = 2; // COURSE-3: a race needs at least two riders
export const MAX_RIDERS = 40; // COURSE-4: a full class (35) with room to spare (H-2)
export const FINISH_GRACE_MS = 30_000; // COURSE-15: once someone finishes, the rest get this long (H-3)
export const RECONNECT_MS = 30_000; // COURSE-14: how long a dropped rider's lane is kept for them
