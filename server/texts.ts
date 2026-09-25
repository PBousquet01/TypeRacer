// Where race texts come from (TXT-3): the passage bank and the word
// dictionary in PostgreSQL. Nothing to type is written in the code.
import { sql } from "./db";
import type { TextKind, TextLanguage } from "../lib/types";

const WORDS_PER_RACE = 30;

export interface TextRequest {
  language?: TextLanguage;
  kind?: TextKind;
}

export function isLanguage(value: unknown): value is TextLanguage {
  return value === "en" || value === "fr";
}

export function isKind(value: unknown): value is TextKind {
  return value === "sentences" || value === "words";
}

async function randomPassage(language: TextLanguage): Promise<string | null> {
  const [row]: { body: string }[] = await sql`
    SELECT body FROM passages WHERE language = ${language} ORDER BY random() LIMIT 1`;
  return row?.body ?? null;
}

async function randomWords(language: TextLanguage): Promise<string | null> {
  const rows: { word: string }[] = await sql`
    SELECT word FROM words WHERE language = ${language} ORDER BY random() LIMIT ${WORDS_PER_RACE}`;
  return rows.length ? rows.map((r) => r.word).join(" ") : null;
}

/** A text to race on. Falls back to random words if the passage bank is empty. */
export async function pickText({ language = "en", kind = "sentences" }: TextRequest = {}): Promise<string> {
  const text =
    (kind === "sentences" ? await randomPassage(language) : null) ?? (await randomWords(language));
  if (!text) throw new Error(`The text bank has nothing in "${language}". Run the server once to seed it.`);
  return text;
}
