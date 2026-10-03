// Comeback bonuses (BONUS-01 to BONUS-04), as pure functions the referee
// calls. The rule:
//
//   - Checkpoints are reached when the leader (the rider furthest along their
//     own text) passes 25 %, 50 % and 75 %.
//   - At each checkpoint, every lagging rider gets one bonus. Lagging: still
//     typing, not the leader, and either last or more than 25 % behind the
//     leader. Nobody gets more than 3 in a race (one per checkpoint).
//   - The bonus is drawn from three kinds: "shorten" takes 3 words off the
//     end of the lagging rider's own text; "lengthen" adds 3 words to the end
//     of the leader's text; "fog" hides the leader's next words for a few
//     seconds. The leader is hit at most once per checkpoint: once one
//     lagging rider has slowed them, the others get "shorten".
//   - Words only ever change at the end of a text, beyond where its rider
//     is, so what they already typed stays right.
import { seededRandom } from "./bots";

export const BONUS_KINDS = ["shorten", "lengthen", "fog"] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];

export const CHECKPOINTS = [0.25, 0.5, 0.75];
export const BEHIND_BY = 0.25;
export const MAX_BONUSES = 3;
export const BONUS_WORDS = 3;
export const FOG_MS = 4000;
// A shortened text keeps at least this many characters ahead of its rider.
const KEEP_AHEAD = 10;

export interface Contender {
  id: string;
  progress: number; // 0..1, against their own text
  finished: boolean;
  bonuses: number; // received so far this race
}

/** The rider furthest along; the first one on a tie. */
export function leaderOf(field: Contender[]): Contender | undefined {
  return field.reduce<Contender | undefined>((best, c) => (!best || c.progress > best.progress ? c : best), undefined);
}

/** BONUS-01: who gets a bonus at this checkpoint, furthest behind first. */
export function laggards(field: Contender[]): Contender[] {
  const leader = leaderOf(field);
  if (!leader) return [];
  const running = field.filter((c) => !c.finished && c.id !== leader.id);
  const last = Math.min(...running.map((c) => c.progress));
  return running
    .filter((c) => c.bonuses < MAX_BONUSES && (c.progress === last || c.progress < leader.progress - BEHIND_BY))
    .sort((a, b) => a.progress - b.progress);
}

/** How many checkpoints the leader has passed, from 0 to 3. */
export function checkpointsPassed(leaderProgress: number): number {
  return CHECKPOINTS.filter((cp) => leaderProgress >= cp).length;
}

export interface Award {
  to: string; // the lagging rider who earned it
  kind: BonusKind;
  target: string; // whose race it changes: the lagging rider for "shorten", the leader otherwise
}

/**
 * The bonuses handed out at one checkpoint. `canShorten(id)` says whether a
 * rider's text still has room to lose words; the draw comes from `seed`, so
 * the same race gives the same bonuses.
 */
export function awardCheckpoint(
  field: Contender[],
  seed: number,
  canShorten: (id: string) => boolean,
): Award[] {
  const leader = leaderOf(field);
  if (!leader) return [];
  const rand = seededRandom(seed);
  const awards: Award[] = [];
  let leaderHit = leader.finished; // a finished leader has nothing left to slow down
  for (const lagging of laggards(field)) {
    let kind: BonusKind = leaderHit ? "shorten" : BONUS_KINDS[Math.floor(rand() * BONUS_KINDS.length)];
    if (kind === "shorten" && !canShorten(lagging.id)) {
      if (leaderHit) continue;
      kind = "lengthen";
    }
    if (kind !== "shorten") leaderHit = true;
    awards.push({ to: lagging.id, kind, target: kind === "shorten" ? lagging.id : leader.id });
  }
  return awards;
}

/** BONUS-02 "+3 words": `words` added to the end of the text. */
export function lengthen(text: string, words: string[]): string {
  return `${text} ${words.join(" ")}`;
}

/**
 * BONUS-02 "-3 words": the text without its last `count` words, or null when
 * that would leave fewer than a few characters ahead of position `at`.
 */
export function shorten(text: string, at: number, count = BONUS_WORDS): string | null {
  const words = text.split(" ");
  if (words.length <= count) return null;
  const shorter = words.slice(0, -count).join(" ");
  return shorter.length >= at + KEEP_AHEAD ? shorter : null;
}

/** `count` words picked from `text` with `rand`, for "+3 words". */
export function pickWords(text: string, count: number, rand: () => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  return Array.from({ length: count }, () => words[Math.floor(rand() * words.length)]);
}
