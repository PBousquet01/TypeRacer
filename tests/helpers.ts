import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { randomBytes } from "node:crypto";
import { registerRoomHandlers, reserveRoomCode, type IO } from "../server/rooms";
import { createUser } from "../server/auth";
import { sql } from "../server/db";
import type { ActionReply, ClientToServerEvents, JoinReply, PublicRoom, ServerToClientEvents, User, Visibility } from "../lib/types";

// AUTH-03, SALLE-01: only a signed-in user opens a room, so the tests' hosts
// share one throwaway account, deleted (with its races) when the server closes.
let hostAccount: User | null = null;

/** The real room referee on a random port. Hosts are signed in as the test account; everyone else is a guest. */
export async function startGameServer() {
  const made = await createUser({ username: `th_${randomBytes(4).toString("hex")}`, password: randomBytes(16).toString("hex"), displayName: "Host" });
  if ("error" in made) throw new Error(made.error);
  hostAccount = made.user;
  const http = createServer();
  const io: IO = new Server(http);
  io.use((socket, next) => {
    socket.data.user = socket.handshake.auth.signedIn ? hostAccount : null;
    // SALLE-06: each test client is its own person unless a test says otherwise.
    socket.data.person = `t:${String(socket.handshake.auth.person)}`;
    socket.data.roomCode = null;
    // A test can say which address a client comes from (invite links are tied to one).
    const ip: unknown = socket.handshake.auth.ip;
    socket.data.ip = typeof ip === "string" ? ip : socket.handshake.address;
    next();
  });
  io.on("connection", (socket) => registerRoomHandlers(io, socket));
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;
  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await sleep(100); // the last leaves release their rows
      await sql`DELETE FROM room_members WHERE person LIKE 't:%'`;
      const id = made.user.id;
      await sql`DELETE FROM race_runs WHERE id IN (SELECT run_id FROM races WHERE user_id = ${id})`;
      await sql`DELETE FROM users WHERE id = ${id}`;
    },
  };
}

export interface TestClient {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  room: PublicRoom | null;
  join: (extra?: { color?: string; role?: "host" | "rider"; leaveOther?: boolean }) => Promise<JoinReply>;
  startRace: () => Promise<ActionReply>;
  me: () => PublicRoom["players"][number] | undefined;
  /** Resolves once the latest room update passes `check`. */
  until: (check: (room: PublicRoom) => boolean, ms?: number) => Promise<PublicRoom>;
  close: () => void;
}

export interface ClientOptions {
  ip?: string; // the address the server should see
  invite?: string; // an invite link's token
  guest?: boolean; // a host who isn't signed in
  person?: string; // SALLE-06: who this is; two clients with the same person are one person in two tabs
}

export async function client(
  url: string,
  code: string,
  name: string,
  role: "host" | "rider",
  { ip, invite, guest = false, person = `${code}-${name}` }: ClientOptions = {},
): Promise<TestClient> {
  const auth = { person, ...(ip ? { ip } : {}), ...(role === "host" && !guest ? { signedIn: true } : {}) };
  const socket: TestClient["socket"] = connect(url, { transports: ["websocket"], forceNew: true, auth });
  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));

  const c: TestClient = {
    socket,
    room: null,
    join: (extra = {}) =>
      new Promise((resolve) =>
        socket.emit("joinRoom", { code, name, role, clientId: `${code}-${name}`, ...(invite ? { invite } : {}), ...extra }, resolve),
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

/** A room code issued by the referee to the test host, as a host gets from POST /api/rooms. */
export const freshCode = (visibility?: Visibility) => reserveRoomCode(hostAccount!.id, visibility);
