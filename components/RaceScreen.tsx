"use client";

import { useEffect, useRef } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { formatTime } from "@/lib/format";
import type { PublicRoom } from "@/lib/types";
import Track from "./Track";
import TypingBox from "./TypingBox";
import Countdown from "./Countdown";
import { Stat, StatsBar } from "./ui";

interface RaceScreenProps {
  room: PublicRoom;
  myId: string | null;
  raceStartedAt: number | null;
  onProgress: (charIndex: number) => void;
  onStats: (stats: { accuracy: number }) => void;
}

export default function RaceScreen({ room, myId, raceStartedAt, onProgress, onStats }: RaceScreenProps) {
  const racing = room.status === "racing";
  const engine = useTypingEngine(room.text, { enabled: racing, onProgress });
  const reportedRef = useRef(false);

  useEffect(() => {
    if (engine.isDone && !reportedRef.current) {
      reportedRef.current = true;
      onStats({ accuracy: engine.accuracy });
    }
  }, [engine.isDone, engine.accuracy, onStats]);

  return (
    <div className="grid gap-3.5">
      <StatsBar>
        <Stat value={engine.wpm} label="WPM" accent />
        <Stat value={`${engine.accuracy}%`} label="ACCURATE" />
        <Stat value={formatTime(engine.elapsedMs)} label="ELAPSED" />
      </StatsBar>

      <div className="frame relative">
        <Track
          players={room.players.filter((p) => p.racing)}
          myId={myId}
          racing={racing}
          textLength={room.text.length}
          raceStartedAt={raceStartedAt}
          stalled={engine.hasMistake}
        />
        {room.status === "countdown" && <Countdown startsIn={room.startsIn} />}
      </div>

      <TypingBox text={room.text} engine={engine} enabled={racing} />
    </div>
  );
}
