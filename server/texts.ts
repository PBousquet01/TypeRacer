// Where race texts come from (TXT-3): the passage bank and the word
// dictionary in PostgreSQL. Nothing to type is written in the code.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { passages, words } from "./schema";
import { buildText, DEFAULT_TEXT_OPTIONS, type TextOptions } from "../lib/textgen";
import type { TextKind, TextLanguage } from "../lib/types";

export interface TextRequest extends Partial<TextOptions> {
  language?: TextLanguage;
  kind?: TextKind;
}

export function isLanguage(value: unknown): value is TextLanguage {
  return value === "en" || value === "fr";
}

/**
 * A text to race on, built from the host's settings (lib/textgen.ts) out of
 * the language's passages and dictionary. Falls back to random words if the
 * passage bank is empty.
 */
export async function pickText({ language = "en", kind = "sentences", ...options }: TextRequest = {}): Promise<string> {
  const [bank, dictionary] = await Promise.all([
    db.select({ body: passages.body }).from(passages).where(eq(passages.language, language)),
    db.select({ word: words.word }).from(words).where(eq(words.language, language)),
  ]);
  const text = buildText(
    { passages: bank.map((p) => p.body), words: dictionary.map((w) => w.word) },
    { ...DEFAULT_TEXT_OPTIONS, ...options, kind },
  );
  if (!text) throw new Error(`Nothing to type in "${language}" with these settings.`);
  return text;
}
