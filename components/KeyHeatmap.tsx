"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { PublicPlayer } from "@/lib/types";

// RES-03: the keys a rider missed most, on a keyboard. A key is shaded by
// how often it was missed compared with that rider's worst key (three
// steps of one hue); characters that aren't on the keyboard are listed below it.
const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
const ON_KEYBOARD = new Set([...ROWS.join(""), " "]);
const HEAT = ["", "bg-[var(--heat-1)]", "bg-[var(--heat-2)]", "bg-[var(--heat-3)]"];
const HEAT_TEXT = ["", "text-ink light:text-white", "text-ink light:text-white", "text-ink light:text-white"];

/** Misses per key: capitals count on their letter. */
function perKey(missed: Record<string, number>) {
  const keys: Record<string, number> = {};
  const others: Record<string, number> = {};
  for (const [char, n] of Object.entries(missed)) {
    const key = char.toLowerCase();
    if (ON_KEYBOARD.has(key)) keys[key] = (keys[key] ?? 0) + n;
    else others[char] = (others[char] ?? 0) + n;
  }
  return { keys, others };
}

interface KeyHeatmapProps {
  racers: PublicPlayer[];
  myId: string | null;
}

export default function KeyHeatmap({ racers, myId }: KeyHeatmapProps) {
  const t = useT();
  const withKeys = racers.filter((p) => p.samples.length > 0);
  const firstChoice = withKeys.find((p) => p.id === myId) ?? [...withKeys].sort((a, b) => (a.place ?? 999) - (b.place ?? 999))[0];
  const [chosen, setChosen] = useState<string | null>(null);
  const rider = withKeys.find((p) => p.id === chosen) ?? firstChoice;
  if (!rider) return null;

  const { keys, others } = perKey(rider.missed);
  const worst = Math.max(0, ...Object.values(keys), ...Object.values(others));
  const step = (n: number) => (n <= 0 || worst === 0 ? 0 : Math.max(1, Math.ceil((n / worst) * 3)));
  const label = (key: string) => (key === " " ? t.charts.space : key.toUpperCase());

  const key = (k: string, wide = false) => {
    const n = keys[k] ?? 0;
    return (
      <span
        key={k}
        title={t.charts.missedTimes(label(k), n)}
        aria-label={t.charts.missedTimes(label(k), n)}
        className={cn(
          "grid h-8 place-items-center rounded-sm border font-body text-[11px] max-wide:h-7 max-wide:text-[10px]",
          wide ? "w-[min(260px,60%)]" : "w-8 max-wide:w-[7.5%]",
          n > 0 ? cn(HEAT[step(n)], HEAT_TEXT[step(n)], "border-transparent font-medium") : "border-edge/25 text-muted light:border-ink/20",
        )}
      >
        {label(k)}
      </span>
    );
  };

  return (
    <figure className="m-0 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-xs/normal text-accent uppercase">{t.charts.heatTitle}</figcaption>
        {withKeys.length > 1 && (
          <label className="inline-flex items-center gap-2 font-body text-xs text-muted">
            {t.charts.heatFor}
            <select
              value={rider.id}
              onChange={(e) => setChosen(e.target.value)}
              className="border-2 border-edge/30 bg-ink px-2 py-1 text-copy light:border-ink/25 light:bg-paper"
            >
              {withKeys.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === myId ? ` (${t.common.you})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {worst === 0 ? (
        <p className="m-0 font-body text-sm text-copy">{t.charts.noMisses(rider.name)}</p>
      ) : (
        <>
          <div className="grid justify-items-center gap-1.5" role="img" aria-label={t.charts.heatLabel(rider.name)}>
            {ROWS.map((row, r) => (
              <div key={row} className="flex gap-1.5" style={{ paddingLeft: `${r * 10}px` }}>
                {[...row].map((k) => key(k))}
              </div>
            ))}
            <div className="flex w-full justify-center">
              {key(" ", true)}
            </div>
          </div>
          {Object.keys(others).length > 0 && (
            <p className="m-0 font-body text-xs text-muted">
              {t.charts.others}{" "}
              {Object.entries(others)
                .sort((a, b) => b[1] - a[1])
                .map(([char, n]) => `${char} ×${n}`)
                .join(" · ")}
            </p>
          )}
          <div className="flex items-center gap-2 font-body text-[11px] text-muted" aria-hidden="true">
            {t.charts.fewer}
            {[1, 2, 3].map((s) => (
              <span key={s} className={cn("inline-block size-3 rounded-sm", HEAT[s])} />
            ))}
            {t.charts.more}
          </div>
        </>
      )}
    </figure>
  );
}
