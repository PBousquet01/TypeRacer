"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RoomBar from "@/components/RoomBar";
import Track from "@/components/Track";
import TypingBox from "@/components/TypingBox";
import { FinePrint, Loading, Panel, PanelTitle, Spec, SpecRow, Stat, StatsBar, StatusTag } from "@/components/ui";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { useSavedProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { formatTime } from "@/lib/format";

export default function PracticePage() {
  const [text, setText] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const fetchText = useCallback(() => {
    let active = true;
    fetch("/api/text")
      .then((res) => res.json())
      .then((data: { text: string }) => active && setText(data.text))
      .catch(() => active && setText("The chocobo waited for a passage that never arrived."));
    return () => {
      active = false;
    };
  }, []);

  useEffect(fetchText, [fetchText, round]);

  if (!text) return <Loading>Fetching a passage…</Loading>;

  return (
    <PracticeRun
      key={round}
      text={text}
      onAnother={() => {
        setText(null);
        setRound((n) => n + 1);
      }}
    />
  );
}

function PracticeRun({ text, onAnother }: { text: string; onAnother: () => void }) {
  const saved = useSavedProfile();
  const { user } = useSession();
  const engine = useTypingEngine(text, { enabled: true });

  const rider = {
    id: "me",
    name: user?.displayName ?? saved?.name ?? "You",
    color: saved?.color ?? "yellow",
    progress: engine.correctChars / text.length,
    liveWpm: engine.wpm,
    finished: engine.isDone,
    wpm: engine.wpm,
    place: null,
  };

  return (
    <main className="mx-auto grid max-w-[1280px] gap-4 p-[18px]">
      <RoomBar phase="Practice · nothing is recorded" />

      <div className="grid gap-3.5">
        <StatsBar>
          <StatusTag>PRACTICE · NOT A RACE</StatusTag>
          <Stat value={engine.wpm} label="WPM" accent />
          <Stat value={`${engine.accuracy}%`} label="ACC" />
          <Stat value={formatTime(engine.elapsedMs)} label="TIME" />
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
            <PanelTitle>Run finished</PanelTitle>
            <Spec>
              <SpecRow label="Speed">{engine.wpm} wpm</SpecRow>
              <SpecRow label="Accuracy">{engine.accuracy}%</SpecRow>
              <SpecRow label="Time">{formatTime(engine.elapsedMs)}</SpecRow>
            </Spec>
            <button className="btn btn-primary btn-block" onClick={onAnother}>
              Another passage
            </button>
            <Link className="btn btn-block" href="/">
              Back to the stables
            </Link>
            <FinePrint>Practice runs stay between you and the bird — nothing here is saved.</FinePrint>
          </Panel>
        ) : (
          <TypingBox text={text} engine={engine} enabled />
        )}
      </div>
    </main>
  );
}
