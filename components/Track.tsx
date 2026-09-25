"use client";

import { useEffect, useState } from "react";
import Chocobo from "./Chocobo";
import { cn } from "@/lib/cn";

const START = 14;
const RUN = 86;

export interface TrackRider {
  id: string;
  name: string;
  color: string;
  progress: number;
  finished: boolean;
  wpm: number | null;
  place: number | null;
  liveWpm?: number;
}

interface TrackProps {
  players: TrackRider[];
  myId: string | null;
  racing: boolean;
  textLength: number;
  raceStartedAt: number | null;
  stalled: boolean;
}

function liveWpm(progress: number, textLength: number, raceStartedAt: number | null, now: number) {
  if (!raceStartedAt || !textLength) return 0;
  const minutes = (now - raceStartedAt) / 60000;
  if (minutes <= 0.016) return 0;
  return Math.round((progress * textLength) / 5 / minutes);
}

export default function Track({ players, myId, racing, textLength, raceStartedAt, stalled }: TrackProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!racing) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [racing]);

  return (
    <div className="relative overflow-hidden bg-field">
      <div>
        {players.map((p) => {
          const progress = p.progress ?? 0;
          const isMe = p.id === myId;
          const isStalled = isMe && stalled && !p.finished;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex h-[68px] items-center border-b-2 border-dashed border-edge/20 last:border-b-0 max-wide:h-[58px] light:border-ink/28",
                isMe && "bg-accent/10 light:bg-accent/12",
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 bg-linear-to-r transition-[width] duration-120 ease-linear motion-reduce:transition-none",
                  isMe
                    ? "from-accent/6 to-accent/26 light:from-accent/10 light:to-accent/40"
                    : "from-edge/2 to-edge/12 light:from-ink/2 light:to-ink/12",
                )}
                style={{ left: `${START}%`, width: `${progress * RUN}%` }}
              />
              <div
                className="absolute z-2 flex -translate-x-full items-center gap-2.5 transition-[left] duration-120 ease-linear motion-reduce:transition-none"
                style={{ left: `${START + progress * RUN}%` }}
              >
                <div className="grid justify-items-end gap-[5px] text-right">
                  <span
                    className={cn(
                      "font-display text-tiny/[1.4] whitespace-nowrap uppercase",
                      isMe ? "text-accent" : "text-strong",
                    )}
                  >
                    {p.name}
                    {isMe && <span className="text-muted max-wide:hidden"> · you</span>}
                  </span>
                  {isStalled ? (
                    <span className="border-2 border-paper bg-ember px-1.5 py-1 font-display text-tiny/[1.4] whitespace-nowrap text-ink">
                      STALLED — FIX THE TYPO
                    </span>
                  ) : (
                    <span className="font-body text-label/none whitespace-nowrap text-copy max-wide:hidden">
                      {p.finished
                        ? `${p.wpm} WPM · FINISHED ${p.place ? `#${p.place}` : ""}`
                        : `${p.liveWpm ?? liveWpm(progress, textLength, raceStartedAt, now)} WPM · ${Math.round(progress * 100)}%`}
                    </span>
                  )}
                </div>
                <Chocobo
                  color={p.color}
                  running={racing && !p.finished && !isStalled}
                  stumbling={isStalled}
                  size={isMe ? 46 : 40}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-y-0 right-0 z-1 w-[22px] bg-finish-line" aria-hidden="true" />
    </div>
  );
}
