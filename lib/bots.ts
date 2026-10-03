// The bots' typing (BOT-01 to BOT-05), as a pure function: from a seed, a text
// and a level, the list of keys a bot will press and when. No Math.random and
// no clock, so the same seed always gives the same race and the engine can be
// unit-tested. The referee (server/rooms.ts) plays the plan back and sends the
// keys through the same rules as a human's (replayKeys), so bots get no
// special treatment: same progress, accuracy, WPM and ranking.
import { BACKSPACE, type ErrorMode } from "./typing";

export const BOT_LEVEL_IDS = ["noob", "beginner", "intermediate", "expert", "impossible"] as const;
export type BotLevel = (typeof BOT_LEVEL_IDS)[number];

export interface BotProfile {
  wpm: [number, number]; // the WPM a bot of this level finishes with is drawn in this range
  errorRate: number; // share of characters typed wrong at first
}

// BOT-01, with the cahier's ranges and error rates. "Impossible" is capped at
// 170 so it stays well under the server's ~300 WPM anti-cheat limit.
export const BOT_LEVELS: Record<BotLevel, BotProfile> = {
  noob: { wpm: [10, 20], errorRate: 0.12 },
  beginner: { wpm: [20, 35], errorRate: 0.08 },
  intermediate: { wpm: [35, 60], errorRate: 0.05 },
  expert: { wpm: [70, 100], errorRate: 0.02 },
  impossible: { wpm: [140, 170], errorRate: 0.005 },
};

export interface BotKey {
  atMs: number; // time after the start of the race
  key: string; // a character, or BACKSPACE
}

/** mulberry32: a tiny seeded generator. Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number seed from any string (FNV-1a), e.g. "ROOMCD:3:bot-2". */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Keys next to each other on a QWERTY keyboard: a slip lands on a neighbour.
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function neighbour(char: string, rand: () => number): string {
  const lower = char.toLowerCase();
  const row = ROWS.findIndex((r) => r.includes(lower));
  let options: string[];
  if (row === -1) {
    options = [..."etaoinsr"].filter((c) => c !== lower);
  } else {
    const i = ROWS[row].indexOf(lower);
    options = [ROWS[row][i - 1], ROWS[row][i + 1], ROWS[row - 1]?.[i], ROWS[row + 1]?.[i]].filter(
      (c): c is string => Boolean(c),
    );
  }
  const pick = options[Math.floor(rand() * options.length)];
  return char === lower ? pick : pick.toUpperCase();
}

/**
 * How hard a word is to type, from 0 to 1: long words, capitals, digits,
 * punctuation and accents all slow a typist down. Bots hesitate before them.
 */
export function wordDifficulty(word: string): number {
  let score = Math.min(1, Math.max(0, word.length - 5) / 8);
  if (/[A-Z]/.test(word)) score += 0.2;
  if (/[0-9]/.test(word)) score += 0.3;
  if (/[^\p{L}\p{N}]/u.test(word)) score += 0.2;
  if (/[^\x00-\x7f]/.test(word)) score += 0.2;
  return Math.min(1, score);
}

export interface PlanOptions {
  seed: number;
  text: string;
  level: BotLevel;
  errorMode?: ErrorMode;
}

/** Every key the bot presses during the race, in order, with its time. */
export function planBot({ seed, text, level, errorMode = "correct" }: PlanOptions): BotKey[] {
  const rand = seededRandom(seed);
  const profile = BOT_LEVELS[level];
  const [low, high] = profile.wpm;
  const targetWpm = low + rand() * (high - low);
  const beat = 60_000 / (targetWpm * 5); // average time per character at that speed

  const keys: { gap: number; key: string }[] = [];
  const press = (key: string, gap: number) => keys.push({ key, gap });

  let pace = 1; // drifts word to word: bursts above 1, slumps below
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const atWordStart = i === 0 || text[i - 1] === " ";
    if (atWordStart) pace = Math.min(1.35, Math.max(0.7, pace + (rand() - 0.5) * 0.3));

    let gap: number;
    if (i === 0) {
      gap = beat * (2 + rand() * 3); // reaction time before the first key
    } else {
      gap = (beat / pace) * (0.55 + rand() * 0.9);
      // BOT-02: a pause before a hard word, on top of the drifting pace.
      if (atWordStart) {
        const end = text.indexOf(" ", i);
        gap += beat * wordDifficulty(text.slice(i, end === -1 ? text.length : end)) * (1 + rand() * 2);
      }
    }

    if (char === " " || rand() >= profile.errorRate) {
      press(char, gap);
      continue;
    }

    // BOT-03: a slip onto a neighbouring key. In "free" mode the bot carries
    // on. In "correct" mode it notices after 0 to 2 more characters, stops,
    // backspaces to the mistake and types it right.
    press(neighbour(char, rand), gap);
    if (errorMode === "free") continue;
    const carriedOn = Math.min(Math.floor(rand() * 3), text.length - i - 1);
    for (let k = 1; k <= carriedOn; k++) press(text[i + k], (beat / pace) * (0.55 + rand() * 0.9));
    press(BACKSPACE, beat * (2 + rand() * 4)); // the moment of noticing
    for (let k = 0; k < carriedOn; k++) press(BACKSPACE, beat * (0.4 + rand() * 0.3));
    press(char, beat * (0.8 + rand() * 0.6));
  }

  // Every slip and pause costs time, so the raw plan finishes slower than the
  // speed that was drawn. Stretch it to finish at exactly that speed; the
  // rhythm inside (bursts, hesitations, corrections) stays as planned.
  const total = keys.reduce((sum, k) => sum + k.gap, 0);
  const wanted = (text.length / 5 / targetWpm) * 60_000;
  const scale = total > 0 ? wanted / total : 1;
  let at = 0;
  return keys.map(({ key, gap }) => {
    at += gap * scale;
    return { atMs: Math.round(at), key };
  });
}
