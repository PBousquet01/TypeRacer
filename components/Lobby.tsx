"use client";

import { useState } from "react";
import Chocobo from "./Chocobo";
import { BotTag, Choice, FinePrint, HostTag, MonoNote, Panel, PanelTitle, Spec, SpecRow } from "./ui";
import { cn } from "@/lib/cn";
import { MAX_RIDERS, MIN_RIDERS } from "@/lib/rules";
import { useT } from "@/lib/i18n";
import type { PublicRoom, RoomSettings } from "@/lib/types";
import type { BotLevel } from "@/lib/bots";

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
  onChangeSettings: (settings: Partial<RoomSettings>) => void;
  onSetWatching: (playerId: string, watching: boolean) => void;
  onAddBot: (level: BotLevel) => void;
  onRemoveBot: (playerId: string) => void;
}

export default function Lobby({
  room,
  myId,
  isHost,
  onToggleReady,
  onStartRace,
  onChangeSettings,
  onSetWatching,
  onAddBot,
  onRemoveBot,
}: LobbyProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [botLevel, setBotLevel] = useState<BotLevel>("intermediate");
  const me = room.players.find((p) => p.id === myId);
  const host = room.players.find((p) => p.id === room.hostId);
  const hostRides = room.settings.hostRides;
  const riders = room.players.filter((p) => p.role === "rider");
  const lineup = room.players.filter((p) => p.role === "rider" || hostRides);
  const readyCount = lineup.filter((p) => p.role === "host" || (p.ready && !p.watching)).length;
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
            {t.lobby.riders} <span className="font-body text-muted">{lineup.length} / {MAX_RIDERS}</span>
          </h2>
          <MonoNote>{t.lobby.readyCount(readyCount)}</MonoNote>
        </header>

        <ul className="frame m-0 grid list-none bg-window px-5 py-[18px]">
          {lineup.map((p) => {
            const isMe = p.id === myId;
            const isHostRow = p.role === "host";
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
                    {isMe && <MonoNote> · {t.common.you}</MonoNote>}
                    {isHostRow && <> <HostTag>{t.common.host}</HostTag></>}
                    {p.bot && <BotTag>{t.bot.tag}</BotTag>}
                  </span>
                  <span className={SUB}>{p.bot ? t.bot.levels[p.bot] : t.mount.label(p.color)}</span>
                </span>
                <span className="grid justify-items-end gap-1.5">
                  <span
                    className={cn(
                      "font-display text-tiny/[1.4] whitespace-nowrap",
                      p.watching ? "text-muted" : p.ready || isHostRow ? "text-green" : "text-amber",
                    )}
                  >
                    {p.watching ? t.lobby.watching : p.ready || isHostRow ? t.lobby.ready : t.lobby.eating}
                  </span>
                  {isHost && p.bot && (
                    <button className="btn-link" onClick={() => onRemoveBot(p.id)}>
                      {t.lobby.removeBot}
                    </button>
                  )}
                  {isHost && !isHostRow && !p.bot && (
                    <button className="btn-link" onClick={() => onSetWatching(p.id, !p.watching)}>
                      {p.watching ? t.lobby.letRide : t.lobby.toStands}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {(lineup.length === 0 || freeStalls > 0) && (
            <li className={RIDER_ROW}>
              <span className={CURSOR} aria-hidden="true" />
              <span className={cn(MOUNT_BOX, "border-dashed border-edge/50 light:border-ink/35")} />
              <span className={SUB}>
                {lineup.length === 0 ? t.lobby.noRiders : t.lobby.stallsOpen(freeStalls)}
              </span>
            </li>
          )}
        </ul>
      </section>

      <aside className="grid content-start gap-4">
        {isHost ? (
          <>
            <Panel>
              <PanelTitle>{t.lobby.settings}</PanelTitle>
              <Choice
                label={t.text.languageLabel}
                value={room.settings.language}
                options={t.text.languages}
                onChange={(language) => onChangeSettings({ language })}
              />
              <Choice
                label={t.text.kindLabel}
                value={room.settings.kind}
                options={t.text.kinds}
                onChange={(kind) => onChangeSettings({ kind })}
              />
              <Choice
                label={t.lobby.hostLabel}
                value={hostRides ? "ride" : "watch"}
                options={t.lobby.hostOptions}
                onChange={(choice) => onChangeSettings({ hostRides: choice === "ride" })}
              />
              <FinePrint>{t.lobby.settingsHint}</FinePrint>
            </Panel>
            <Panel>
              <PanelTitle>{t.lobby.bots}</PanelTitle>
              <Choice label={t.lobby.botLevel} value={botLevel} options={t.bot.levels} onChange={setBotLevel} />
              <button className="btn btn-block" onClick={() => onAddBot(botLevel)} disabled={freeStalls <= 0}>
                {t.lobby.addBot}
              </button>
              <FinePrint>{t.lobby.botsHint}</FinePrint>
            </Panel>
            <Panel>
              <PanelTitle>{t.lobby.control}</PanelTitle>
              <Spec>
                <SpecRow label={t.lobby.ridersRow}>{lineup.length} / {MAX_RIDERS}</SpecRow>
                <SpecRow label={t.lobby.readyRow}>{readyCount}</SpecRow>
                <SpecRow label={t.lobby.textRow}>{t.text.label(room.settings)}</SpecRow>
              </Spec>
              <button className="btn btn-primary btn-block" onClick={onStartRace} disabled={!canStart}>
                {canStart ? t.lobby.start(readyCount) : t.lobby.waiting(readyCount)}
              </button>
              <FinePrint>{t.lobby.controlHint(hostRides)}</FinePrint>
            </Panel>
          </>
        ) : (
          <Panel>
            <PanelTitle>{t.lobby.rules}</PanelTitle>
            <Spec>
              <SpecRow label={t.lobby.textRow}>{t.text.label(room.settings)}</SpecRow>
              <SpecRow label={t.lobby.backspace}>{t.lobby.backspaceValue}</SpecRow>
              <SpecRow label={t.lobby.mistakes}>{t.lobby.mistakesValue}</SpecRow>
              <SpecRow label={t.lobby.winner}>{t.lobby.winnerValue}</SpecRow>
              <SpecRow label={t.lobby.lastCall}>{t.lobby.lastCallValue}</SpecRow>
            </Spec>
            {me?.watching ? (
              <FinePrint>{t.lobby.youWatch}</FinePrint>
            ) : (
              <button className="btn btn-primary btn-block" onClick={onToggleReady}>
                {me?.ready ? t.lobby.wait : t.lobby.imReady}
              </button>
            )}
            <FinePrint>
              {host ? t.lobby.hostStarts(host.name) : t.lobby.waitingForHost}
            </FinePrint>
          </Panel>
        )}

        <Panel>
          <PanelTitle>{isHost ? t.lobby.yourRoom : t.lobby.yourMount}</PanelTitle>
          <div className="grid h-32 place-items-center border-2 border-edge/50 bg-sky light:border-ink/35">
            {isHost && !hostRides ? (
              <span className="bg-accent px-3.5 py-2.5 font-display text-[13px]/[1.4] text-ink light:text-white">{t.common.host}</span>
            ) : (
              <Chocobo color={me?.color ?? "yellow"} size={78} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2.5 font-body text-[13px]/[1.3]">
            <span className="font-body text-sm/[1.3] font-medium text-strong">
              {me?.name}
              <span className={SUB}>
                {isHost ? t.lobby.runningShow : ` · ${t.mount.label(me?.color).toLowerCase()}`}
              </span>
            </span>
            <button className="btn-link" onClick={copyLink}>
              {copied ? t.lobby.copied : t.lobby.copyInvite}
            </button>
          </div>
        </Panel>
      </aside>

      <div className="frame col-span-full overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-2 border-edge/25 bg-bar px-[18px] py-3 font-display text-tiny text-accent uppercase">
          <span>{t.lobby.circuit(room.code)}</span>
          <MonoNote>{t.lobby.preview}</MonoNote>
        </div>
        <div className="relative h-[132px] overflow-hidden bg-field" aria-hidden="true">
          {(lineup.length ? lineup : [{ id: "empty", color: "yellow" }]).map((p, i) => (
            <span
              key={p.id}
              className={cn("absolute left-0 animate-lap motion-reduce:animate-none", !lineup.length && "opacity-55")}
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
