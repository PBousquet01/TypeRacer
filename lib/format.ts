export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A date and time in the reader's language (I18N-03): "3 oct. 2026, 14 h 05" or "Oct 3, 2026, 2:05 PM". */
export function formatDateTime(iso: string, lang: "en" | "fr"): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}
