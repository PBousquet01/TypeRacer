"use client";

import { useState } from "react";
import Chocobo from "./Chocobo";
import { FinePrint, MonoNote, Panel, PanelTitle, Spec, SpecRow } from "./ui";
import { mountLabel } from "@/lib/chocobos";
import { cn } from "@/lib/cn";
import { MAX_RIDERS, MIN_RIDERS } from "@/lib/rules";
import type { PublicRoom } from "@/lib/types";

const RIDER_ROW = "flex items-center gap-3 border-b border-edge/14 py-3 last:border-b-0 light:border-ink/14";
const CURSOR = "w-4 flex-none font-display text-xs/none text-accent";
const MOUNT_BOX = "grid size-12 flex-none place-items-center border-2";
const SUB = "font-body text-xs/[1.3] text-muted uppercase";

interface LobbyProps {
  room: PublicRoom;
  myId: string | null;
  isHost: boolean;
  onToggleReady: () => void;
  onStartRace: () => void;
}

export default function Lobby({ room, myId, isHost, onToggleReady, onStartRace }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const me = room.players.find((p) => p.id === myId);
  const host = room.players.find((p) => p.id === room.hostId);
  const riders = room.players.filter((p) => p.role === "rider");
  const readyCount = riders.filter((p) => p.ready).length;
  const freeStalls = MAX_RIDERS - riders.length;
  const canStart = readyCount >= MIN_RIDERS;

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="grid gap-4 wide:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="grid content-start">
        <header className="flex flex-wrap items-baseline justify-between gap-3 pb-3.5">
          <h2 className="text-xs/normal text-accent uppercase">
            Riders <span className="font-body text-muted">{riders.length} / {MAX_RIDERS}</span>
          </h2>
          <MonoNote>{readyCount} READY</MonoNote>
        </header>

        <ul className="frame m-0 grid list-none bg-window px-5 py-[18px]">
          {riders.map((p) => {
            const isMe = p.id === myId;
            return (
              <li key={p.id} className={RIDER_ROW}>
                <span className={CURSOR} aria-hidden="true">
                  {isMe ? "▶" : ""}
                </span>
                <span className={cn(MOUNT_BOX, "border-edge/50 bg-ink/55 light:border-ink/35 light:bg-ink/5")}>
                  <Chocobo color={p.color} size={34} />
                </span>
                <span className="grid min-w-0 flex-1 gap-[5px]">
                  <span className={cn("font-body text-sm/[1.3] font-medium", isMe ? "text-accent" : "text-strong")}>
                    {p.name}
                    {isMe && <MonoNote> · you</MonoNote>}
                  </span>
                  <span className={SUB}>{mountLabel(p.color)}</span>
                </span>
                <span
                  className={cn(
                    "font-display text-tiny/[1.4] whitespace-nowrap",
                    p.ready ? "text-green" : "text-amber",
                  )}
                >
                  {p.ready ? "READY" : "EATING"}
                </span>
              </li>
            );
          })}
          {(riders.length === 0 || freeStalls > 0) && (
            <li className={RIDER_ROW}>
              <span className={CURSOR} aria-hidden="true" />
              <span className={cn(MOUNT_BOX, "border-dashed border-edge/50 light:border-ink/35")} />
              <span className={SUB}>
                {riders.length === 0
                  ? "— No riders yet · send the invite link —"
                  : `— ${freeStalls} ${freeStalls === 1 ? "stall" : "stalls"} open · send the invite code —`}
              </span>
            </li>
          )}
        </ul>
      </section>

      <aside className="grid content-start gap-4">
        {isHost ? (
          <Panel>
            <PanelTitle>Race control</PanelTitle>
            <Spec>
              <SpecRow label="Riders">{riders.length} / {MAX_RIDERS}</SpecRow>
              <SpecRow label="Ready">{readyCount}</SpecRow>
              <SpecRow label="Text">One paragraph, picked at random</SpecRow>
            </Spec>
            <button className="btn btn-primary btn-block" onClick={onStartRace} disabled={!canStart}>
              {canStart ? `Start race (${readyCount})` : `Waiting for riders (${readyCount}/${MIN_RIDERS})`}
            </button>
            <FinePrint>
              A race needs at least {MIN_RIDERS} ready riders. Only they take part. You run the race and
              watch — you don&apos;t type.
            </FinePrint>
          </Panel>
        ) : (
          <Panel>
            <PanelTitle>Rules</PanelTitle>
            <Spec>
              <SpecRow label="Text">One paragraph, picked at random</SpecRow>
              <SpecRow label="Backspace">Allowed — and required</SpecRow>
              <SpecRow label="Mistakes">Stall your bird until fixed</SpecRow>
              <SpecRow label="Winner">First to type the last letter</SpecRow>
              <SpecRow label="Last call">30 s once someone finishes</SpecRow>
            </Spec>
            <button className="btn btn-primary btn-block" onClick={onToggleReady}>
              {me?.ready ? "Actually, wait" : "I'm ready"}
            </button>
            <FinePrint>
              {host ? `${host.name} starts the race when riders are ready.` : "Waiting for a host."}
            </FinePrint>
          </Panel>
        )}

        <Panel>
          <PanelTitle>{isHost ? "Your room" : "Your mount"}</PanelTitle>
          <div className="grid h-32 place-items-center border-2 border-edge/50 bg-sky light:border-ink/35">
            {isHost ? (
              <span className="bg-accent px-3.5 py-2.5 font-display text-[13px]/[1.4] text-ink light:text-white">HOST</span>
            ) : (
              <Chocobo color={me?.color ?? "yellow"} size={78} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2.5 font-body text-[13px]/[1.3]">
            <span className="font-body text-sm/[1.3] font-medium text-strong">
              {me?.name}
              <span className={SUB}>
                {isHost ? " · running the show" : ` · ${mountLabel(me?.color).toLowerCase()}`}
              </span>
            </span>
            <button className="btn-link" onClick={copyLink}>
              {copied ? "COPIED" : "COPY INVITE"}
            </button>
          </div>
        </Panel>
      </aside>

      <div className="frame col-span-full overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-2 border-edge/25 bg-bar px-[18px] py-3 font-display text-tiny text-accent uppercase">
          <span>Room {room.code} Circuit</span>
          <MonoNote>COURSE PREVIEW</MonoNote>
        </div>
        <div className="relative h-[132px] overflow-hidden bg-field" aria-hidden="true">
          {(riders.length ? riders : [{ id: "empty", color: "yellow" }]).map((p, i) => (
            <span
              key={p.id}
              className={cn("absolute left-0 animate-lap motion-reduce:animate-none", !riders.length && "opacity-55")}
              style={{
                animationDelay: `${i * -1.9}s`,
                animationDuration: `${10 + (i % 4)}s`,
                bottom: `${20 + (i % 3) * 16}px`,
              }}
            >
              <Chocobo color={p.color} size={i % 3 === 1 ? 34 : 40} running />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
