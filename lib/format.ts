import type { RoomSettings, TextKind, TextLanguage } from "./types";

export const LANGUAGE_LABELS: Record<TextLanguage, string> = { en: "English", fr: "French" };
export const KIND_LABELS: Record<TextKind, string> = { sentences: "Sentences", words: "Random words" };

export function textLabel({ language, kind }: RoomSettings): string {
  return `${LANGUAGE_LABELS[language]} · ${KIND_LABELS[kind].toLowerCase()}`;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function placeLabel(place: number | null | undefined): string {
  if (!place) return "DNF";
  const suffix = place === 1 ? "ST" : place === 2 ? "ND" : place === 3 ? "RD" : "TH";
  return `${place}${suffix}`;
}
