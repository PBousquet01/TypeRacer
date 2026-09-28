import { cookies, headers } from "next/headers";
import type { Lang } from "../types";

const COOKIE = "chocobo-lang";

/** The visitor's language: their saved choice, else the browser's preference, else English. */
export async function requestLang(): Promise<Lang> {
  const saved = (await cookies()).get(COOKIE)?.value;
  if (saved === "en" || saved === "fr") return saved;

  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code === "fr" || code === "en") return code;
  }
  return "en";
}
