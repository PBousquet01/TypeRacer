"use client";

import Chocobo from "./Chocobo";
import { BotTag, FinePrint, Panel, PanelTitle, Spec, SpecRow, Table, Td, Th } from "./ui";
import { formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/en";
import { cn } from "@/lib/cn";
import type { PublicPlayer } from "@/lib/types";

function rank(players: PublicPlayer[]) {
  return [...players].sort(
    (a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || (b.progress ?? 0) - (a.progress ?? 0),
  );
}

function headline(ranked: PublicPlayer[], t: Dictionary) {
  const winner = ranked.find((p) => p.place === 1);
  const runnerUp = ranked.find((p) => p.place === 2);
  const best = ranked.find((p) => p.place);

  if (winner && runnerUp?.timeMs && winner.timeMs) {
    if (winner.timeMs > runnerUp.timeMs) {
      return t.results.onAccuracy(winner.name, runnerUp.name);
    }
    const margin = Math.max(1, Math.round((runnerUp.timeMs - winner.timeMs) / 1000));
    return t.results.byMargin(winner.name, margin);
  }
  if (winner) return t.results.takes(winner.name);
  if (best) return t.results.came(best.name, t.common.place(best.place));
  return t.results.nobody;
}

interface ResultsProps {
  players: PublicPlayer[];
  myId: string | null;
  roomCode: string;
  isHost: boolean;
  hostName: string | undefined;
  onPlayAgain: () => void;
}

export default function Results({ players, myId, roomCode, isHost, hostName, onPlayAgain }: ResultsProps) {
  const t = useT();
  const ranked = rank(players.filter((p) => p.racing));
  const me = ranked.find((p) => p.id === myId);
  const watched = !isHost && !me;
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);

  return (
    <div className="grid gap-4">
      <header className="frame grid justify-items-center gap-3 bg-headline px-[30px] py-7 text-center">
        <h2 className="text-[clamp(13px,2vw,18px)] text-accent uppercase [text-shadow:3px_3px_0_var(--ink)] light:[text-shadow:3px_3px_0_rgba(16,26,63,0.22)]">
          {t.results.complete}
        </h2>
        <p className="max-w-[62ch] font-body text-sm/[1.7] text-copy">{headline(ranked, t)}</p>
        <span className="font-display text-label tracking-[0.08em] text-accent">{t.results.room(roomCode)}</span>
      </header>

      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-4">
        {podium.map((p) => {
          const winner = p.place === 1;
          return (
            <div key={p.id} className="grid gap-3">
              <div
                className={cn(
                  "grid place-items-center border-2 bg-ink/50 light:bg-ink/5",
                  winner ? "h-[150px] border-accent" : "h-[110px] border-edge/50 light:border-ink/35",
                )}
              >
                <Chocobo color={p.color} size={winner ? 84 : 58} />
              </div>
              <div
                className={cn(
                  "frame grid justify-items-center gap-2.5 p-4",
                  winner ? "border-accent! bg-raised" : "bg-window",
                )}
              >
                <span className={cn("font-display", winner ? "text-[13px] text-accent" : "text-xs text-muted")}>
                  {t.common.place(p.place)}
                </span>
                <span className="font-body text-[15px]/[1.3] font-medium text-strong">
                  {p.name}
                  {p.bot && <BotTag>{t.bot.tag}</BotTag>}
                  {p.id === myId && <span className="text-accent"> · {t.common.you}</span>}
                </span>
                {p.score != null && (
                  <span className={cn("font-display text-sm/none", winner ? "text-accent" : "text-strong")}>
                    {t.common.pts(p.score)}
                  </span>
                )}
                <span className={cn("font-body text-[12.5px]/[1.3]", winner ? "text-accent" : "text-copy")}>
                  {p.wpm ? t.common.wpm(p.wpm) : t.common.didntFinish}
                  {p.accuracy != null && ` · ${p.accuracy}%`}
                  {p.timeMs != null && ` · ${formatTime(p.timeMs)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 wide:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="frame grid content-start gap-3 bg-window px-5 py-[18px]">
          <h3 className="text-lg/normal">{t.results.fullField}</h3>
          <Table>
            <thead>
              <tr>
                <Th className="w-5" aria-label={t.results.yourRow} />
                <Th>#</Th>
                <Th>{t.results.rider}</Th>
                <Th num>{t.results.score}</Th>
                <Th num>{t.results.wpm}</Th>
                <Th num>{t.results.acc}</Th>
                <Th num>{t.results.time}</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => {
                const isMe = p.id === myId;
                const tone = isMe ? "text-accent" : "text-strong";
                return (
                  <tr key={p.id}>
                    <Td className="w-5 font-display text-tiny text-accent" aria-hidden>
                      {isMe ? "▶" : ""}
                    </Td>
                    <Td className={tone}>{p.place ?? i + 1}</Td>
                    <Td className={cn("font-medium", tone)}>
                      {p.name}
                      {p.bot && <BotTag>{t.bot.levels[p.bot]}</BotTag>}
                      {isMe && ` · ${t.common.you}`}
                    </Td>
                    <Td num className={cn("font-medium", tone)}>{p.score ?? "—"}</Td>
                    <Td num className={tone}>{p.wpm ?? "—"}</Td>
                    <Td num className={tone}>{p.accuracy != null ? `${p.accuracy}%` : "—"}</Td>
                    <Td num className={tone}>{p.place ? formatTime(p.timeMs) : t.common.place(null)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>

        <aside className="grid content-start gap-4">
          {me && (
            <Panel>
              <PanelTitle>{t.results.yourRace}</PanelTitle>
              <Spec>
                <SpecRow label={t.results.placeRow}>{me?.place ? t.common.place(me.place) : t.common.didntFinish}</SpecRow>
                <SpecRow label={t.results.scoreRow}>{me?.score != null ? t.common.pts(me.score) : "—"}</SpecRow>
                <SpecRow label={t.results.speedRow}>{me?.wpm ? t.common.wpm(me.wpm) : "—"}</SpecRow>
                <SpecRow label={t.results.accuracyRow}>{me?.accuracy != null ? `${me.accuracy}%` : "—"}</SpecRow>
                <SpecRow label={t.results.timeRow}>{me?.place ? formatTime(me.timeMs) : "—"}</SpecRow>
              </Spec>
            </Panel>
          )}
          {isHost ? (
            <>
              <button className="btn btn-primary btn-block" onClick={onPlayAgain}>
                {t.results.backToLobby}
              </button>
              <FinePrint>{t.results.hostHint}</FinePrint>
            </>
          ) : (
            <FinePrint>
              {watched && t.results.watched}
              {hostName ? t.results.hostTakesBack(hostName) : t.results.waitingForHost}
            </FinePrint>
          )}
        </aside>
      </div>
    </div>
  );
}
