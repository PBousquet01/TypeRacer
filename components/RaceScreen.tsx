"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { formatTime } from "@/lib/format";
import type { PublicRoom } from "@/lib/types";
import Track from "./Track";
import TypingBox from "./TypingBox";
import Countdown from "./Countdown";
import FinishClock from "./FinishClock";
import { Stat, StatsBar } from "./ui";
import { useT } from "@/lib/i18n";

interface RaceScreenProps {
  room: PublicRoom;
  myId: string | null;
  raceStartedAt: number | null;
  finishDeadline: number | null;
  onKeys: (base: number, keys: string) => void;
}

export default function RaceScreen({
  room,
  myId,
  raceStartedAt,
  finishDeadline,
  onKeys,
}: RaceScreenProps) {
  const t = useT();
  const racing = room.status === "racing";
  const me = room.players.find((p) => p.id === myId);
  const [resume] = useState(() =>
    me && me.charIndex > 0 && raceStartedAt ? { correctChars: me.charIndex, startedAt: raceStartedAt } : null,
  );
  const sentRef = useRef<[base: number, keys: string][]>([]);
  const report = useCallback(
    (base: number, keys: string) => {
      sentRef.current.push([base, keys]);
      onKeys(base, keys);
    },
    [onKeys],
  );
  const engine = useTypingEngine(room.text, { enabled: racing && !me?.finished, onKeys: report, resume });
  const socketRef = useRef(myId);

  // A dropped connection comes back on a new socket id. Reports sent while it
  // was down may have been lost, so send them all again in order: the server
  // skips the ones it already has (their base is behind its own count).
  useEffect(() => {
    if (!myId || socketRef.current === myId) return;
    socketRef.current = myId;
    sentRef.current.forEach(([base, keys]) => onKeys(base, keys));
  }, [myId, onKeys]);

  return (
    <div className="grid gap-3.5">
      <StatsBar>
        <Stat value={engine.wpm} label={t.race.wpm} accent />
        <Stat value={`${engine.accuracy}%`} label={t.race.accurate} />
        <Stat value={formatTime(engine.elapsedMs)} label={t.race.elapsed} />
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
