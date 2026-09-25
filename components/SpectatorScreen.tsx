"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import type { PublicRoom } from "@/lib/types";
import Track from "./Track";
import Countdown from "./Countdown";
import { PROMPT_BOX, PROMPT_HINT, PROMPT_TEXT } from "./TypingBox";
import { Stat, StatsBar, StatusTag } from "./ui";

export default function SpectatorScreen({ room, raceStartedAt }: { room: PublicRoom; raceStartedAt: number | null }) {
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
        <StatusTag>SPECTATING · YOU&apos;RE THE HOST</StatusTag>
        <Stat value={field.length} label="RIDERS" accent />
        <Stat value={finished} label="FINISHED" />
        <Stat value={formatTime(elapsed)} label="ELAPSED" />
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
        <p className={PROMPT_HINT}>This is what your riders are typing.</p>
      </div>
    </div>
  );
}
