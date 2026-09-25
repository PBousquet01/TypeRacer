"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import type { PublicRoom } from "@/lib/types";
import Track from "./Track";
import Countdown from "./Countdown";
import FinishClock from "./FinishClock";
import { PROMPT_BOX, PROMPT_HINT, PROMPT_TEXT } from "./TypingBox";
import { Stat, StatsBar, StatusTag } from "./ui";

interface SpectatorScreenProps {
  room: PublicRoom;
  raceStartedAt: number | null;
  finishDeadline: number | null;
  isHost: boolean;
}

export default function SpectatorScreen({ room, raceStartedAt, finishDeadline, isHost }: SpectatorScreenProps) {
  const racing = room.status === "racing";
  const field = room.players.filter((p) => p.racing);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!racing) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [racing]);

  const elapsed = raceStartedAt ? Math.max(0, now - raceStartedAt) : 0;
  const finished = field.filter((p) => p.finished).length;

  return (
    <div className="grid gap-3.5">
      <StatsBar>
        <StatusTag>{isHost ? "SPECTATING · YOU'RE THE HOST" : "SPECTATING · YOU RIDE NEXT RACE"}</StatusTag>
        <Stat value={field.length} label="RIDERS" accent />
        <Stat value={finished} label="FINISHED" />
        <Stat value={formatTime(elapsed)} label="ELAPSED" />
        <FinishClock deadline={finishDeadline} />
      </StatsBar>

      <div className="frame relative">
        <Track
          players={field}
          myId={null}
          racing={racing}
          textLength={room.text.length}
          raceStartedAt={raceStartedAt}
          stalled={false}
        />
        {room.status === "countdown" && <Countdown startsIn={room.startsIn} />}
      </div>

      <div className={PROMPT_BOX}>
        <p className={`${PROMPT_TEXT} text-dim`}>{room.text}</p>
        <p className={PROMPT_HINT}>
          {isHost ? "This is what your riders are typing." : "This is what the riders are typing."}
        </p>
      </div>
    </div>
  );
}
