"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { clientId } from "@/lib/profile";
import type { Position, Profile, PublicRoom, RoomSettings } from "@/lib/types";

export function useRoom(code: string, profile: Profile | null) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [finishDeadline, setFinishDeadline] = useState<number | null>(null);
  const lastStatus = useRef<PublicRoom["status"] | null>(null);

  useEffect(() => {
    if (!profile) return;
    const socket = getSocket();

    const join = () => {
      setMyId(socket.id ?? null);
      socket.emit("joinRoom", { code, clientId: clientId(), ...profile }, (res) => {
        if ("error" in res) setError(res.error);
        else if (res.note) setNotice(res.note);
      });
    };

    const onRoom = (next: PublicRoom) => {
      if (lastStatus.current !== null && lastStatus.current !== next.status) setNotice(null);
      lastStatus.current = next.status;
      setRoom(next);
      setRaceStartedAt((current) => {
        if (next.status === "racing") return current ?? Date.now() - next.elapsedMs;
        return next.status === "finished" ? current : null;
      });
      setFinishDeadline(next.finishIn === null ? null : Date.now() + next.finishIn);
    };

    const onPositions = (list: Position[]) => {
      const byId = Object.fromEntries(list.map((p) => [p.id, p.progress]));
      setRoom((prev) =>
        prev && {
          ...prev,
          players: prev.players.map((p) => ({ ...p, progress: byId[p.id] ?? p.progress })),
        },
      );
    };

    socket.on("roomUpdate", onRoom);
    socket.on("positions", onPositions);
    socket.on("connect", join); // also rejoins after a dropped connection
    if (socket.connected) join();

    // Always clean up: React (especially Next dev mode) can mount this twice.
    return () => {
      socket.emit("leaveRoom");
      socket.off("roomUpdate", onRoom);
      socket.off("positions", onPositions);
      socket.off("connect", join);
    };
  }, [code, profile]);

  const toggleReady = useCallback(() => getSocket().emit("toggleReady"), []);
  const startRace = useCallback(
    () => getSocket().emit("startRace", null, (res) => "error" in res && setError(res.error)),
    [],
  );
  const sendProgress = useCallback((charIndex: number) => getSocket().emit("progress", charIndex), []);
  const sendStats = useCallback((stats: { accuracy: number }) => getSocket().emit("stats", stats), []);
  const playAgain = useCallback(() => getSocket().emit("playAgain"), []);
  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => getSocket().emit("updateSettings", settings),
    [],
  );

  return {
    room,
    myId,
    error,
    notice,
    raceStartedAt,
    finishDeadline,
    toggleReady,
    startRace,
    sendProgress,
    sendStats,
    playAgain,
    updateSettings,
  };
}
