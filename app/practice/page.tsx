"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RoomBar from "@/components/RoomBar";
import Track from "@/components/Track";
import TypingBox from "@/components/TypingBox";
import { Choice, FinePrint, Loading, Panel, PanelTitle, Spec, SpecRow, Stat, StatsBar, StatusTag } from "@/components/ui";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { useSavedProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { formatTime } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { scoreOf } from "@/lib/rules";
import type { RoomSettings } from "@/lib/types";

export default function PracticePage() {
  const { lang, t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [settings, setSettings] = useState<RoomSettings>({ language: lang, kind: "sentences" });
  const fallbackText = t.practice.fallbackText;

  const fetchText = useCallback(() => {
    let active = true;
    fetch(`/api/text?lang=${settings.language}&kind=${settings.kind}`)
      .then((res) => res.json())
      .then((data: { text: string }) => active && setText(data.text))
      .catch(() => active && setText(fallbackText));
    return () => {
      active = false;
    };
  }, [settings, fallbackText]);

  useEffect(fetchText, [fetchText, round]);

  if (!text) return <Loading>{t.practice.fetching}</Loading>;

  return (
    <PracticeRun
      key={round}
      text={text}
      settings={settings}
      onSettings={(changes) => {
        setText(null);
        setSettings((current) => ({ ...current, ...changes }));
      }}
      onAnother={() => {
        setText(null);
        setRound((n) => n + 1);
      }}
    />
  );
}

interface PracticeRunProps {
  text: string;
  settings: RoomSettings;
  onSettings: (changes: Partial<RoomSettings>) => void;
  onAnother: () => void;
}

function PracticeRun({ text, settings, onSettings, onAnother }: PracticeRunProps) {
  const t = useT();
  const saved = useSavedProfile();
  const { user } = useSession();
  const engine = useTypingEngine(text, { enabled: true });

  const rider = {
    id: "me",
    name: user?.displayName ?? saved?.name ?? t.practice.defaultName,
    color: saved?.color ?? "yellow",
    progress: engine.correctChars / text.length,
    liveWpm: engine.wpm,
    finished: engine.isDone,
    wpm: engine.wpm,
    place: null,
  };

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 p-[18px]">
      <RoomBar phase={t.practice.phase} />

      <div className="grid gap-3.5">
        <StatsBar>
          <StatusTag>{t.practice.tag}</StatusTag>
          <Stat value={engine.wpm} label={t.race.wpm} accent />
          <Stat value={`${engine.accuracy}%`} label={t.practice.acc} />
          <Stat value={formatTime(engine.elapsedMs)} label={t.practice.time} />
        </StatsBar>

        <div className="frame relative">
          <Track
            players={[rider]}
            myId="me"
            racing={!engine.isDone}
            textLength={text.length}
            raceStartedAt={null}
            stalled={engine.hasMistake}
          />
        </div>

        {engine.isDone ? (
          <Panel>
            <PanelTitle>{t.practice.runFinished}</PanelTitle>
            <Spec>
              <SpecRow label={t.results.scoreRow}>{t.common.pts(scoreOf(engine.wpm, engine.accuracy))}</SpecRow>
              <SpecRow label={t.results.speedRow}>{t.common.wpm(engine.wpm)}</SpecRow>
              <SpecRow label={t.results.accuracyRow}>{engine.accuracy}%</SpecRow>
              <SpecRow label={t.results.timeRow}>{formatTime(engine.elapsedMs)}</SpecRow>
            </Spec>
            <button className="btn btn-primary btn-block" onClick={onAnother}>
              {t.practice.another}
            </button>
            <Link className="btn btn-block" href="/">
              {t.common.backToStables}
            </Link>
            <FinePrint>{t.practice.savedHint}</FinePrint>
          </Panel>
        ) : (
          <TypingBox text={text} engine={engine} enabled />
        )}

        <Panel className="wide:grid-cols-2 wide:gap-x-6">
          <Choice
            label={t.text.languageLabel}
            value={settings.language}
            options={t.text.languages}
            onChange={(language) => onSettings({ language })}
          />
          <Choice
            label={t.text.kindLabel}
            value={settings.kind}
            options={t.text.kinds}
            onChange={(kind) => onSettings({ kind })}
          />
        </Panel>
      </div>
    </main>
  );
}
