"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { saveProfile, useSavedProfile } from "@/lib/profile";
import type { Profile } from "@/lib/types";
import JoinCard from "@/components/JoinCard";
import RoomBar from "@/components/RoomBar";
import Lobby from "@/components/Lobby";
import RaceScreen from "@/components/RaceScreen";
import SpectatorScreen from "@/components/SpectatorScreen";
import Results from "@/components/Results";
import { HostTag, Loading, Notice } from "@/components/ui";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const saved = useSavedProfile();
  const [chosen, setChosen] = useState<Profile | null>(null);
  const profile = chosen ?? saved ?? null;

  const {
    room,
    myId,
    error,
    notice,
    raceStartedAt,
    toggleReady,
    startRace,
    sendProgress,
    sendStats,
    playAgain,
  } = useRoom(code, profile);

  if (saved === undefined && !chosen) return <Loading>Saddling up…</Loading>;

  if (!profile) {
    return (
      <JoinCard
        code={code}
        onSubmit={(next) => {
          saveProfile(next);
          setChosen(next);
        }}
      />
    );
  }

  if (error) {
    return (
      <JoinCard
        code={code}
        error={error}
        onSubmit={(next) => {
          saveProfile(next);
          setChosen({ ...next });
        }}
      />
    );
  }

  if (!room) return <Loading>Saddling up…</Loading>;

  const phase = room.status === "lobby" ? "Lobby" : room.status === "finished" ? "Results" : "Racing";
  const isHost = room.hostId === myId;
  const hostName = room.players.find((p) => p.id === room.hostId)?.name;

  return (
    <main className="mx-auto grid max-w-[1280px] gap-4 p-[18px]">
      <RoomBar phase={`${phase} · Room ${room.code} Circuit`}>
        {isHost && <HostTag>HOST</HostTag>}
        <span className="text-green">ROOM {room.code}</span>
      </RoomBar>

      {notice && <Notice>{notice}</Notice>}
      {room.hostAway && (
        <Notice>The host dropped out. Holding their seat for a few seconds in case they come back…</Notice>
      )}

      {room.status === "lobby" && (
        <Lobby room={room} myId={myId} isHost={isHost} onToggleReady={toggleReady} onStartRace={startRace} />
      )}

      {(room.status === "countdown" || room.status === "racing") &&
        (isHost ? (
          <SpectatorScreen room={room} raceStartedAt={raceStartedAt} />
        ) : (
          <RaceScreen
            key={room.raceId}
            room={room}
            myId={myId}
            raceStartedAt={raceStartedAt}
            onProgress={sendProgress}
            onStats={sendStats}
          />
        ))}

      {room.status === "finished" && (
        <Results
          players={room.players}
          myId={myId}
          roomCode={room.code}
          isHost={isHost}
          hostName={hostName}
          onPlayAgain={playAgain}
        />
      )}
    </main>
  );
}
