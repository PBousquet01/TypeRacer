import Chocobo from "./Chocobo";
import { FinePrint, Panel, PanelTitle, Spec, SpecRow, Table, Td, Th } from "./ui";
import { formatTime, placeLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PublicPlayer } from "@/lib/types";

function rank(players: PublicPlayer[]) {
  return [...players].sort(
    (a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || (b.progress ?? 0) - (a.progress ?? 0),
  );
}

function headline(ranked: PublicPlayer[]) {
  const winner = ranked.find((p) => p.place === 1);
  const runnerUp = ranked.find((p) => p.place === 2);
  const best = ranked.find((p) => p.place);

  if (winner && runnerUp?.timeMs && winner.timeMs) {
    const margin = Math.max(1, Math.round((runnerUp.timeMs - winner.timeMs) / 1000));
    return `${winner.name} took it by ${margin} second${margin === 1 ? "" : "s"}.`;
  }
  if (winner) return `${winner.name} takes the circuit.`;
  if (best) return `${best.name} came ${placeLabel(best.place).toLowerCase()}; the rest rode off.`;
  return "Nobody made it to the finish line.";
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
  const ranked = rank(players.filter((p) => p.racing));
  const me = ranked.find((p) => p.id === myId);
  const watched = !isHost && !me;
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);

  return (
    <div className="grid gap-4">
      <header className="frame grid justify-items-center gap-3 bg-headline px-[30px] py-7 text-center">
        <h2 className="text-[clamp(13px,2vw,18px)] text-accent uppercase [text-shadow:3px_3px_0_var(--ink)] light:[text-shadow:3px_3px_0_rgba(16,26,63,0.22)]">
          Race complete
        </h2>
        <p className="max-w-[62ch] font-body text-sm/[1.7] text-copy">{headline(ranked)}</p>
        <span className="font-display text-label tracking-[0.08em] text-accent">ROOM {roomCode}</span>
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
                  {placeLabel(p.place)}
                </span>
                <span className="font-body text-[15px]/[1.3] font-medium text-strong">
                  {p.name}
                  {p.id === myId && <span className="text-accent"> · you</span>}
                </span>
                <span className={cn("font-body text-[12.5px]/[1.3]", winner ? "text-accent" : "text-copy")}>
                  {p.wpm ? `${p.wpm} wpm` : "didn't finish"}
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
          <h3 className="text-lg/normal">Full field</h3>
          <Table>
            <thead>
              <tr>
                <Th className="w-5" aria-label="your row" />
                <Th>#</Th>
                <Th>RIDER</Th>
                <Th num>WPM</Th>
                <Th num>ACC</Th>
                <Th num>TIME</Th>
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
                      {isMe && " · you"}
                    </Td>
                    <Td num className={tone}>{p.wpm ?? "—"}</Td>
                    <Td num className={tone}>{p.accuracy != null ? `${p.accuracy}%` : "—"}</Td>
                    <Td num className={tone}>{p.place ? formatTime(p.timeMs) : "DNF"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>

        <aside className="grid content-start gap-4">
          {me && (
            <Panel>
              <PanelTitle>Your race</PanelTitle>
              <Spec>
                <SpecRow label="Place">{me?.place ? placeLabel(me.place) : "didn't finish"}</SpecRow>
                <SpecRow label="Speed">{me?.wpm ? `${me.wpm} wpm` : "—"}</SpecRow>
                <SpecRow label="Accuracy">{me?.accuracy != null ? `${me.accuracy}%` : "—"}</SpecRow>
                <SpecRow label="Time">{me?.place ? formatTime(me.timeMs) : "—"}</SpecRow>
              </Spec>
            </Panel>
          )}
          {isHost ? (
            <>
              <button className="btn btn-primary btn-block" onClick={onPlayAgain}>
                Back to the lobby
              </button>
              <FinePrint>Riders ready up again, then you start the next race.</FinePrint>
            </>
          ) : (
            <FinePrint>
              {watched && "You watched this one. "}
              {hostName ? `${hostName} takes everyone back to the lobby.` : "Waiting for the host."}
            </FinePrint>
          )}
        </aside>
      </div>
    </div>
  );
}
