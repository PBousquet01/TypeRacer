"use client";

import { useState } from "react";
import { formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { PublicPlayer } from "@/lib/types";

// RES-03: every rider's WPM over the race, on one chart. Colours follow the
// rider (their place in the room), never their rank; past eight riders the
// chart keeps you and the best placed, and the table above has everyone.
const MAX_SERIES = 8;
const W = 640;
const H = 240;
const PAD = { top: 24, right: 72, bottom: 28, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** A round top for the axis, and the step between its ticks. */
function niceScale(value: number) {
  const step = value > 120 ? 50 : value > 60 ? 20 : 10;
  return { top: Math.max(step, Math.ceil(value / step) * step), step };
}

interface WpmChartProps {
  racers: PublicPlayer[]; // in the room's join order
  myId: string | null;
}

export default function WpmChart({ racers, myId }: WpmChartProps) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);

  const withData = racers.filter((p) => p.samples.length > 0);
  const byPlace = [...withData].sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
  const kept = new Set(
    [...withData.filter((p) => p.id === myId), ...byPlace.filter((p) => p.id !== myId)].slice(0, MAX_SERIES).map((p) => p.id),
  );
  const series = withData.filter((p) => kept.has(p.id)).map((p, i) => ({ player: p, color: `var(--series-${i + 1})` }));
  if (series.length === 0) return null;

  const seconds = Math.max(...series.map((s) => s.player.samples.length));
  const { top, step } = niceScale(Math.max(...series.flatMap((s) => s.player.samples)));
  const x = (second: number) => PAD.left + (seconds <= 1 ? 0 : (second / (seconds - 1)) * PLOT_W);
  const y = (wpm: number) => PAD.top + PLOT_H - (Math.min(wpm, top) / top) * PLOT_H;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const xStep = seconds > 120 ? 30 : seconds > 40 ? 15 : 5;
  const xTicks = Array.from({ length: Math.floor((seconds - 1) / xStep) + 1 }, (_, i) => i * xStep);
  const labelEnds = series.length <= 4;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const second = Math.round(((px - PAD.left) / PLOT_W) * (seconds - 1));
    setHover(second >= 0 && second < seconds ? second : null);
  }

  const atHover =
    hover === null
      ? []
      : series
          .filter((s) => hover < s.player.samples.length)
          .map((s) => ({ ...s, wpm: s.player.samples[hover] }))
          .sort((a, b) => b.wpm - a.wpm);

  return (
    <figure className="m-0 grid gap-3">
      <figcaption className="text-xs/normal text-accent uppercase">{t.charts.wpmTitle}</figcaption>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 font-body text-xs text-copy">
        {series.map((s) => (
          <li key={s.player.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.player.name}
            {s.player.id === myId && <span className="text-muted"> · {t.common.you}</span>}
          </li>
        ))}
        {withData.length > series.length && (
          <li className="text-muted">{t.charts.moreRiders(withData.length - series.length)}</li>
        )}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none"
          role="img"
          aria-label={t.charts.wpmLabel(series.length)}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(v)} y2={y(v)} className="stroke-edge/15 light:stroke-ink/12" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted font-body text-[11px]">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {xTicks.map((s) => (
            <text key={s} x={x(s)} y={H - 8} textAnchor="middle" className="fill-muted font-body text-[11px]">
              {formatTime(s * 1000)}
            </text>
          ))}
          <text x={PAD.left - 8} y={10} textAnchor="end" className="fill-muted font-body text-[10px] uppercase">
            {t.charts.wpmAxis}
          </text>
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-muted" strokeWidth={1} />
          )}
          {series.map((s) => (
            <polyline
              key={s.player.id}
              points={s.player.samples.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={s.player.id === myId ? 2.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {atHover.map((s) => (
            <circle key={s.player.id} cx={x(hover!)} cy={y(s.wpm)} r={4} fill={s.color} className="stroke-ink light:stroke-paper" strokeWidth={2} />
          ))}
          {labelEnds &&
            series.map((s) => {
              const last = s.player.samples.length - 1;
              return (
                <text
                  key={s.player.id}
                  x={x(last) + 6}
                  y={y(s.player.samples[last])}
                  dy="0.32em"
                  className="fill-copy font-body text-[11px]"
                >
                  {s.player.name.slice(0, 10)}
                </text>
              );
            })}
        </svg>
        {hover !== null && atHover.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 border-2 border-edge/40 bg-ink/90 px-3 py-2 font-body text-xs text-copy light:border-ink/25 light:bg-paper/95"
            style={hover > seconds / 2 ? { left: 8 } : { right: 8 }}
          >
            <div className="mb-1 text-muted">{formatTime(hover * 1000)}</div>
            {atHover.map((s) => (
              <div key={s.player.id} className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                <span className="flex-1">{s.player.name}</span>
                <span className="text-strong">{t.common.wpm(s.wpm)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
