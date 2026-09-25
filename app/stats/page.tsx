"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { Eyebrow, FinePrint, Panel, PanelTitle, Spec, SpecRow, Table, Td, Th } from "@/components/ui";
import { useSession } from "@/lib/session";
import { formatTime, placeLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { LeaderboardRow, RecentRace, StatsSummary } from "@/lib/types";

interface MyStats {
  summary: StatsSummary;
  recent: RecentRace[];
}

export default function StatsPage() {
  const { user, loading } = useSession();
  const [data, setData] = useState<MyStats | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/stats/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: MyStats | null) => active && setData(json))
      .catch(() => {});
    fetch("/api/stats/leaderboard")
      .then((res) => res.json())
      .then((json: { leaderboard?: LeaderboardRow[] }) => active && setBoard(json.leaderboard ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <main className="mx-auto max-w-[1280px] px-[18px] pt-6 pb-[60px]">
      <header className="mb-[18px] flex items-center justify-between gap-4">
        <Link href="/" className="no-underline">
          <Wordmark size={16} />
        </Link>
        <span className="inline-flex items-center gap-3.5">
          <ThemeToggle />
          <Link href="/" className="btn-link">
            BACK TO THE STABLES
          </Link>
        </span>
      </header>

      {!loading && !user && (
        <Panel className="mx-auto w-full max-w-[560px] justify-items-center px-6 py-[22px] text-center">
          <PanelTitle as="h2">Your stats live in an account</PanelTitle>
          <FinePrint>Sign in and every race you finish gets saved here.</FinePrint>
          <Link className="btn btn-primary" href="/account">
            Sign in
          </Link>
        </Panel>
      )}

      {user && (
        <>
          <header className="mb-[18px] grid gap-2.5">
            <Eyebrow>RIDER RECORD</Eyebrow>
            <h2 className="text-xs/normal text-accent uppercase">{user.displayName}</h2>
          </header>

          <section className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Figure value={data?.summary.races ?? 0} label="RACES" />
            <Figure value={data?.summary.wins ?? 0} label="WINS" />
            <Figure value={data?.summary.bestWpm ?? "—"} label="BEST WPM" accent />
            <Figure value={data?.summary.avgWpm ?? "—"} label="AVERAGE WPM" />
            <Figure
              value={data?.summary.avgAccuracy != null ? `${data.summary.avgAccuracy}%` : "—"}
              label="AVERAGE ACCURACY"
            />
          </section>

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <section>
              <h3 className="text-lg/normal">Recent races</h3>
              {data?.recent?.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>WHEN</Th>
                      <Th>ROOM</Th>
                      <Th num>PLACE</Th>
                      <Th num>WPM</Th>
                      <Th num>ACC</Th>
                      <Th num>TIME</Th>
                    </tr>
                  </thead>
                  <tbody className="text-strong">
                    {data.recent.map((r, i) => (
                      <tr key={i}>
                        <Td>{r.finishedAt.slice(0, 16)}</Td>
                        <Td>{r.roomCode}</Td>
                        <Td num>
                          {placeLabel(r.place)}{" "}
                          <span className="font-body text-xs/[1.3] text-muted uppercase">/ {r.riders}</span>
                        </Td>
                        <Td num>{r.wpm}</Td>
                        <Td num>{r.accuracy != null ? `${r.accuracy}%` : "—"}</Td>
                        <Td num>{formatTime(r.timeMs)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <FinePrint>No races yet. Go and win one.</FinePrint>
              )}
            </section>

            <aside className="grid content-start gap-4">
              <Panel>
                <PanelTitle>Fastest on this server</PanelTitle>
                {board.length ? (
                  <Spec>
                    {board.map((row) => (
                      <SpecRow key={row.name} label={row.name}>
                        {row.wpm} wpm
                      </SpecRow>
                    ))}
                  </Spec>
                ) : (
                  <FinePrint>Nobody has finished a race yet.</FinePrint>
                )}
              </Panel>

              {user.unlocks.length > 0 && (
                <Panel>
                  <PanelTitle>Unlocked mounts</PanelTitle>
                  <FinePrint>{user.unlocks.join(", ")}</FinePrint>
                </Panel>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

function Figure({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div className="frame grid justify-items-start gap-2 bg-window px-[18px] py-4">
      <span className={cn("font-display text-lg/none", accent ? "text-accent" : "text-strong")}>{value}</span>
      <span className="font-display text-tiny text-muted">{label}</span>
    </div>
  );
}
