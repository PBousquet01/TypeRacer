import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { registerRoomHandlers, type IO } from "../server/rooms";
import type { ActionReply, ClientToServerEvents, JoinReply, PublicRoom, ServerToClientEvents } from "../lib/types";

/** The real room referee on a random port, with every socket treated as a guest. */
export async function startGameServer() {
  const http = createServer();
  const io: IO = new Server(http);
  io.use((socket, next) => {
    socket.data.user = null;
    socket.data.roomCode = null;
    next();
  });
  io.on("connection", (socket) => registerRoomHandlers(io, socket));
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;
  return {
    url,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}

export interface TestClient {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  room: PublicRoom | null;
  join: (extra?: { color?: string; role?: "host" | "rider" }) => Promise<JoinReply>;
  startRace: () => Promise<ActionReply>;
  me: () => PublicRoom["players"][number] | undefined;
  /** Resolves once the latest room update passes `check`. */
  until: (check: (room: PublicRoom) => boolean, ms?: number) => Promise<PublicRoom>;
  close: () => void;
}

export async function client(url: string, code: string, name: string, role: "host" | "rider"): Promise<TestClient> {
  const socket: TestClient["socket"] = connect(url, { transports: ["websocket"], forceNew: true });
  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));

  const c: TestClient = {
    socket,
    room: null,
    join: (extra = {}) =>
      new Promise((resolve) =>
        socket.emit("joinRoom", { code, name, role, clientId: `${code}-${name}`, ...extra }, resolve),
      ),
    startRace: () => new Promise((resolve) => socket.emit("startRace", null, resolve)),
    me: () => c.room?.players.find((p) => p.name === name),
    until: (check, ms = 5000) =>
      new Promise((resolve, reject) => {
        if (c.room && check(c.room)) return resolve(c.room);
        const timer = setTimeout(() => reject(new Error(`room never reached the expected state (${name})`)), ms);
        const onUpdate = (room: PublicRoom) => {
          if (!check(room)) return;
          clearTimeout(timer);
          socket.off("roomUpdate", onUpdate);
          resolve(room);
        };
        socket.on("roomUpdate", onUpdate);
      }),
    close: () => socket.disconnect(),
  };
  socket.on("roomUpdate", (room) => (c.room = room));
  return c;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let counter = 0;
/** A room code no other test uses (the referee keeps rooms in one shared map). */
export const freshCode = () => `T${Date.now().toString(36).slice(-4).toUpperCase()}${counter++}`;
