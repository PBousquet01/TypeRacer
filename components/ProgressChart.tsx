"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import type { ProgressPoint } from "@/lib/types";

// AUTH-06: a rider's WPM over their races, one point per race, oldest on the
// left. A single series, so no legend: the title names it.
const W = 640;
const H = 220;
const PAD = { top: 24, right: 16, bottom: 28, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export default function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const t = useT();
  const { lang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const step = Math.max(...points.map((p) => p.wpm)) > 120 ? 50 : 20;
  const top = Math.max(step, Math.ceil(Math.max(...points.map((p) => p.wpm)) / step) * step);
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * PLOT_W;
  const y = (wpm: number) => PAD.top + PLOT_H - (wpm / top) * PLOT_H;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" }).format(new Date(iso));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / PLOT_W) * (points.length - 1));
    setHover(i >= 0 && i < points.length ? i : null);
  }

  const point = hover === null ? null : points[hover];

  return (
    <figure className="m-0 grid gap-2">
      <figcaption className="text-xs/normal text-accent uppercase">{t.stats.progressTitle}</figcaption>
      <p className="m-0 font-body text-xs text-muted">{t.stats.progressHint}</p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none"
          role="img"
          aria-label={t.stats.progressLabel(points.length)}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(v)} y2={y(v)} className="stroke-edge/15 light:stroke-ink/12" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted font-body text-[11px]">
                {v}
              </text>
            </g>
          ))}
          <text x={PAD.left - 8} y={10} textAnchor="end" className="fill-muted font-body text-[10px] uppercase">
            {t.charts.wpmAxis}
          </text>
          <text x={PAD.left} y={H - 8} className="fill-muted font-body text-[11px]">
            {shortDate(points[0].at)}
          </text>
          <text x={PAD.left + PLOT_W} y={H - 8} textAnchor="end" className="fill-muted font-body text-[11px]">
            {shortDate(points[points.length - 1].at)}
          </text>
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-muted" strokeWidth={1} />
          )}
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.wpm)}`).join(" ")}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.length <= 40 &&
            points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.wpm)} r={3} fill="var(--series-1)" className="stroke-ink light:stroke-paper" strokeWidth={1.5} />
            ))}
          {point && (
            <circle cx={x(hover!)} cy={y(point.wpm)} r={5} fill="var(--series-1)" className="stroke-ink light:stroke-paper" strokeWidth={2} />
          )}
        </svg>
        {point && (
          <div
            className="pointer-events-none absolute top-2 border-2 border-edge/40 bg-ink/90 px-3 py-2 font-body text-xs text-copy light:border-ink/25 light:bg-paper/95"
            style={hover! > points.length / 2 ? { left: 8 } : { right: 8 }}
          >
            <div className="text-muted">{formatDateTime(point.at, lang)}</div>
            <div className="text-strong">{t.common.wpm(point.wpm)}</div>
          </div>
        )}
      </div>
    </figure>
  );
}
