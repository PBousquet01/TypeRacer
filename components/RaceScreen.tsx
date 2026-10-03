"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { useRecentBonuses } from "@/hooks/useRecentBonuses";
import { formatTime } from "@/lib/format";
import type { BonusEvent, PublicRoom } from "@/lib/types";
import Track from "./Track";
import TypingBox from "./TypingBox";
import Countdown from "./Countdown";
import FinishClock from "./FinishClock";
import { Notice, Stat, StatsBar } from "./ui";
import { useT } from "@/lib/i18n";

interface RaceScreenProps {
  room: PublicRoom;
  myId: string | null;
  raceStartedAt: number | null;
  finishDeadline: number | null;
  onKeys: (base: number, keys: string) => void;
  myText: string | null; // BONUS-04: set once a bonus changed this rider's text
  bonusEvents: (BonusEvent & { at: number })[];
}

export default function RaceScreen({
  room,
  myId,
  raceStartedAt,
  finishDeadline,
  onKeys,
  myText,
  bonusEvents,
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
  const text = myText ?? room.text;
  const engine = useTypingEngine(text, {
    enabled: racing && !me?.finished,
    onKeys: report,
    resume,
    mode: room.settings.errorMode,
  });
  const recent = useRecentBonuses(bonusEvents);
  const flashes = Object.fromEntries(recent.map((e) => [e.target, e.kind]));
  const fogged = recent.some((e) => e.kind === "fog" && e.target === myId);
  const mine = recent.findLast((e) => e.from === myId || e.target === myId);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
  const message = !mine
    ? null
    : mine.from === myId
      ? t.bonus.earned[mine.kind]
      : mine.kind === "shorten"
        ? null
        : t.bonus.against[mine.kind](nameOf(mine.from));
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
          flashes={flashes}
        />
        {room.status === "countdown" && <Countdown startsIn={room.startsIn} />}
      </div>

      {message && <Notice>{message}</Notice>}
      <TypingBox text={text} engine={engine} enabled={racing} fogged={fogged} />
    </div>
  );
}
