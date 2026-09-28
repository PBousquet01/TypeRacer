"use client";

import { useEffect, useRef, useState } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { formatTime } from "@/lib/format";
import type { PublicRoom } from "@/lib/types";
import Track from "./Track";
import TypingBox from "./TypingBox";
import Countdown from "./Countdown";
import FinishClock from "./FinishClock";
import { Stat, StatsBar } from "./ui";

interface RaceScreenProps {
  room: PublicRoom;
  myId: string | null;
  raceStartedAt: number | null;
  finishDeadline: number | null;
  onProgress: (charIndex: number, accuracy?: number) => void;
}

export default function RaceScreen({
  room,
  myId,
  raceStartedAt,
  finishDeadline,
  onProgress,
}: RaceScreenProps) {
  const racing = room.status === "racing";
  const me = room.players.find((p) => p.id === myId);
  const [resume] = useState(() =>
    me && me.charIndex > 0 && raceStartedAt ? { correctChars: me.charIndex, startedAt: raceStartedAt } : null,
  );
  const engine = useTypingEngine(room.text, { enabled: racing && !me?.finished, onProgress, resume });
  const socketRef = useRef(myId);

  // A dropped connection comes back on a new socket id. Anything sent while it
  // was down may have been lost, so tell the server where we are again.
  useEffect(() => {
    if (!myId || socketRef.current === myId) return;
    socketRef.current = myId;
    if (engine.correctChars > 0) onProgress(engine.correctChars, engine.isDone ? engine.accuracy : undefined);
  }, [myId, engine.correctChars, engine.isDone, engine.accuracy, onProgress]);

  return (
    <div className="grid gap-3.5">
      <StatsBar>
        <Stat value={engine.wpm} label="WPM" accent />
        <Stat value={`${engine.accuracy}%`} label="ACCURATE" />
        <Stat value={formatTime(engine.elapsedMs)} label="ELAPSED" />
        <FinishClock deadline={finishDeadline} />
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
