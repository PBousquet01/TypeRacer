"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
import { useT } from "@/lib/i18n";

export default function RoomPage() {
  const t = useT();
  const { code } = useParams<{ code: string }>();
  const invite = useSearchParams().get("invite"); // SALLE-04: set when they came through an invite link
  const saved = useSavedProfile();
  const [chosen, setChosen] = useState<Profile | null>(null);
  const profile = chosen ?? saved ?? null;

  const {
    room,
    myId,
    error,
    notice,
    raceStartedAt,
    finishDeadline,
    toggleReady,
    startRace,
    sendKeys,
    playAgain,
    updateSettings,
    setWatching,
    addBot,
    removeBot,
    invites,
    createInvite,
    myText,
    bonusEvents,
  } = useRoom(code, profile, invite);

  if (saved === undefined && !chosen) return <Loading>{t.common.saddlingUp}</Loading>;

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

  if (!room) return <Loading>{t.common.saddlingUp}</Loading>;

  const phase = room.status === "lobby" ? t.room.lobby : room.status === "finished" ? t.room.results : t.room.racing;
  const isHost = room.hostId === myId;
  const riding = room.players.find((p) => p.id === myId)?.racing ?? false;
  const hostName = room.players.find((p) => p.id === room.hostId)?.name;

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 p-[18px]">
      <RoomBar phase={t.room.bar(phase, room.code)}>
        {isHost && <HostTag>{t.common.host}</HostTag>}
        <span className="text-green">{t.room.code(room.code)}</span>
      </RoomBar>

      {notice && <Notice>{t.notices[notice]}</Notice>}
      {room.hostAway && (
        <Notice>{t.room.hostAway}</Notice>
      )}

      {room.status === "lobby" && (
        <Lobby
          room={room}
          myId={myId}
          isHost={isHost}
          onToggleReady={toggleReady}
          onStartRace={startRace}
          onChangeSettings={updateSettings}
          onSetWatching={setWatching}
          onAddBot={addBot}
          onRemoveBot={removeBot}
          invites={invites}
          onCreateInvite={createInvite}
        />
      )}

      {(room.status === "countdown" || room.status === "racing") &&
        (riding ? (
          <RaceScreen
            key={room.raceId}
            room={room}
            myId={myId}
            raceStartedAt={raceStartedAt}
            finishDeadline={finishDeadline}
            onKeys={sendKeys}
            myText={myText}
            bonusEvents={bonusEvents}
          />
        ) : (
          <SpectatorScreen
            room={room}
            raceStartedAt={raceStartedAt}
            finishDeadline={finishDeadline}
            isHost={isHost}
            bonusEvents={bonusEvents}
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
          bonuses={room.settings.bonuses}
        />
      )}
    </main>
  );
}
