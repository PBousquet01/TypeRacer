"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import Results from "@/components/Results";
import { ErrorText, Loading, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import type { ErrorCode, PastRace } from "@/lib/types";

export default function PastRacePage() {
  const t = useT();
  const { lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [race, setRace] = useState<PastRace | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/races/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!active) return;
        if (res.ok) setRace(json as PastRace);
        else setError((json as { error?: ErrorCode }).error ?? "unknown");
      })
      .catch(() => active && setError("server-error"));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <main className="mx-auto max-w-[1280px] px-[18px] pt-6 pb-[60px]">
      <header className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Link href="/" className="no-underline">
          <Wordmark size={16} />
        </Link>
        <span className="inline-flex items-center gap-3.5">
          <LanguageToggle />
          <ThemeToggle />
          <Link href="/stats" className="btn-link">
            {t.history.back}
          </Link>
        </span>
      </header>

      {error ? (
        <Panel className="mx-auto w-full max-w-[560px] px-6 py-[22px]">
          <ErrorText>{t.errors[error]}</ErrorText>
        </Panel>
      ) : race ? (
        <Results
          players={race.players}
          myId={race.myId}
          roomCode={race.roomCode}
          isHost={false}
          hostName={undefined}
          bonuses={race.bonuses}
          racedOn={formatDateTime(race.finishedAt, lang)}
        />
      ) : (
        <Loading>{t.history.loading}</Loading>
      )}
    </main>
  );
}
