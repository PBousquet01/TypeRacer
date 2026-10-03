"use client";

import { useEffect, useState } from "react";
import type { BonusEvent } from "@/lib/types";

const SHOWN_MS = 3500; // how long a bonus stays announced on the track

/**
 * BONUS-03: the bonuses to show right now. A bonus stays announced for a few
 * seconds, or for as long as it lasts (the fog), and this re-renders while
 * any is still on screen so it disappears on time.
 */
export function useRecentBonuses(events: (BonusEvent & { at: number })[]) {
  const [now, setNow] = useState(() => Date.now());
  const lasts = (e: BonusEvent) => Math.max(SHOWN_MS, e.kind === "fog" ? e.durationMs : 0);
  const active = events.filter((e) => now - e.at < lasts(e));

  useEffect(() => {
    if (!events.some((e) => Date.now() - e.at < lasts(e))) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [events]);

  return active;
}
