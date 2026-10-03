// Builds the text of a race from the host's settings (CONF-03 to CONF-07).
// Pure: the passages, the dictionary and the random draw come in from the
// caller, so every rule here can be tested. The rules, as documented in
// docs/EXIGENCES.md:
//
// Complexity (CONF-05), measured, not guessed:
//   - a passage's level is its average word length in letters:
//     easy below 4.3, medium from 4.3 to 4.6, hard from 4.6;
//   - a random word's level is its length and its letters: easy is 3 or 4
//     letters with no accents or apostrophes, medium is up to 6 letters, hard
//     is 5 letters or more.
// Length (CONF-04): passages of the right level are joined until there are
//   enough words, then cut to that many; random words are drawn that many times.
// Options (CONF-06): off, punctuation, capitals and accents are taken out of
//   any text. On, random words get them added (a capital to some words, a
//   comma or full stop after some, a number in place of some). Passages are
//   real text: numbers can't be added to them, so that option only applies to
//   random words.
// Characters (CONF-07) apply to random words only: words with an excluded
//   character are left out (accented forms count: excluding "e" also leaves
//   out "é"), and with characters to include, only words containing one of
//   them are kept. When that leaves fewer than 5 words, the "include" filter
//   is dropped rather than the race failing.
import type { TextKind } from "./types";

export type Complexity = "easy" | "medium" | "hard";

export interface TextOptions {
  kind: TextKind;
  length: number; // words
  complexity: Complexity;
  punctuation: boolean;
  numbers: boolean;
  capitals: boolean;
  accents: boolean;
  include: string; // characters; random words only
  exclude: string;
}

export const LENGTHS = [10, 25, 50, 100] as const;
export const DEFAULT_TEXT_OPTIONS: Omit<TextOptions, "kind"> = {
  length: 25,
  complexity: "medium",
  punctuation: true,
  numbers: false,
  capitals: true,
  accents: true,
  include: "",
  exclude: "",
};

const MIN_POOL = 5;

/** Letters only, without accents: "Été," → "ete". */
function bare(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

/** Takes out punctuation, keeping apostrophes inside words ("aujourd'hui"). */
export function stripPunctuation(text: string): string {
  return text
    .replace(/(?<=\p{L})['’](?=\p{L})/gu, "\u0000")
    .replace(/[^\p{L}\p{N}\s\u0000]/gu, "")
    .replace(/\u0000/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function averageWordLength(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  const letters = words.reduce((sum, w) => sum + (w.match(/\p{L}/gu)?.length ?? 0), 0);
  return words.length ? letters / words.length : 0;
}

export function passageLevel(text: string): Complexity {
  const avg = averageWordLength(text);
  return avg < 4.3 ? "easy" : avg < 4.6 ? "medium" : "hard";
}

export function wordFits(word: string, level: Complexity): boolean {
  const n = [...word].length;
  if (level === "easy") return n <= 4 && bare(word) === word && !word.includes("'");
  if (level === "medium") return n <= 6;
  return n >= 5;
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fromPassages(passages: string[], options: TextOptions, rand: () => number): string {
  const matching = passages.filter((p) => passageLevel(p) === options.complexity);
  const order = [...shuffled(matching, rand), ...shuffled(passages.filter((p) => !matching.includes(p)), rand)];
  const words: string[] = [];
  for (let i = 0; words.length < options.length && order.length > 0; i++) {
    words.push(...order[i % order.length].split(/\s+/).filter(Boolean));
  }
  return words.slice(0, options.length).join(" ");
}

function fromWords(dictionary: string[], options: TextOptions, rand: () => number): string {
  const excluded = [...bare(options.exclude)].filter((c) => c.trim());
  const included = [...bare(options.include)].filter((c) => c.trim());
  const leveled = dictionary.filter((w) => wordFits(w, options.complexity));
  const base = (leveled.length >= MIN_POOL ? leveled : dictionary).filter(
    (w) => !excluded.some((c) => bare(w).includes(c)),
  );
  const withIncluded = base.filter((w) => included.some((c) => bare(w).includes(c)));
  const pool = included.length && withIncluded.length >= MIN_POOL ? withIncluded : base;
  if (pool.length === 0) return "";

  const out: string[] = [];
  for (let i = 0; i < options.length; i++) {
    let word = pool[Math.floor(rand() * pool.length)];
    if (options.numbers && rand() < 0.12) word = String(Math.floor(rand() * 1000));
    if (options.capitals && (i === 0 || rand() < 0.2)) word = word[0].toUpperCase() + word.slice(1);
    if (options.punctuation && i < options.length - 1 && rand() < 0.15) word += rand() < 0.5 ? "," : ".";
    out.push(word);
  }
  if (options.punctuation) out[out.length - 1] += ".";
  return out.join(" ");
}

/** The text to race on, or "" when nothing fits (the caller then reports it). */
export function buildText(
  source: { passages: string[]; words: string[] },
  options: TextOptions,
  rand: () => number = Math.random,
): string {
  let text =
    options.kind === "sentences" && source.passages.length
      ? fromPassages(source.passages, options, rand)
      : fromWords(source.words, options, rand);
  if (!options.punctuation) text = stripPunctuation(text);
  if (!options.capitals) text = text.toLowerCase();
  if (!options.accents) text = stripAccents(text);
  return text.replace(/\s+/g, " ").trim();
}
