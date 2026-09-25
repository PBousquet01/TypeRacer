// The referee, and the only authority on a race. Clients send nothing but
// "I typed N correct characters"; positions, finish order, WPM and who may
// ride what are all decided here. One host (who never types) per room.
import type { Server, Socket } from "socket.io";
import { pickText } from "./texts";
import { recordRace } from "./stats";
import type {
  ClientToServerEvents,
  PublicPlayer,
  PublicRoom,
  Role,
  RoomStatus,
  ServerToClientEvents,
  User,
} from "../lib/types";

export interface SocketData {
  user: User | null;
  roomCode: string | null;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface Player {
  name: string;
  color: string;
  clientId: string | null; // not shown to anyone; used only to recognise a reconnecting host
  userId: number | null; // set when this rider is signed in; their results get saved
  role: Role;
  ready: boolean;
  racing: boolean; // taking part in the current race
  charIndex: number;
  finished: boolean;
  place: number | null;
  wpm: number | null;
  accuracy: number | null;
  timeMs: number | null;
}

export interface Room {
  code: string;
  status: RoomStatus;
  raceId: number; // goes up by one every race
  text: string;
  startAt: number;
  players: Map<string, Player>; // socket.id -> player (insertion order matters: oldest inherits the host seat)
  hostId: string | null;
  hostClientId: string | null; // survives a reload, so the same person can reclaim the seat
  hostTimeout: ReturnType<typeof setTimeout> | null;
  timeouts: ReturnType<typeof setTimeout>[];
  ticker: ReturnType<typeof setInterval> | null;
}

const MAX_RIDERS = 6;
const COUNTDOWN_MS = 3000;
const TICK_MS = 100; // how often positions are broadcast during a race
const MAX_RACE_MS = 3 * 60 * 1000; // unfinished riders get a DNF after this
const MAX_CHARS_PER_SEC = 25; // ~300 WPM; progress faster than this is ignored
// How long the host seat is held open when the host drops (a refresh, a flaky
// connection) before the longest-present player inherits it.
const HOST_RECLAIM_MS = 20000;

const PRESET_COLORS = ["yellow", "red", "blue", "green", "black", "gold", "fox", "miku", "berry", "joker", "piper", "boba", "invader", "kirby", "tarnished"];
// Mounts that have to be unlocked on an account. The picker hides these, but
// the colour is just a string a client sends, so the real check is here.
const RESTRICTED_MOUNTS = new Set(["fox", "miku", "berry", "joker", "piper", "boba", "invader", "kirby", "tarnished"]);

function safeColor(color: unknown, user: User | null): string {
  const value = String(color ?? "").toLowerCase();
  if (RESTRICTED_MOUNTS.has(value)) {
    return user?.unlocks?.includes(value) ? value : "yellow";
  }
  if (PRESET_COLORS.includes(value) || /^#[0-9a-f]{6}$/.test(value)) return value;
  return "yellow";
}

const rooms = new Map<string, Room>();

function createRoom(code: string): Room {
  return {
    code,
    status: "lobby",
    raceId: 0,
    text: "",
    startAt: 0,
    players: new Map(),
    hostId: null,
    hostClientId: null,
    hostTimeout: null,
    timeouts: [],
    ticker: null,
  };
}

function newPlayer(
  name: string,
  color: string,
  role: Role,
  clientId: string | null,
  userId: number | null,
): Player {
  return {
    name,
    color,
    clientId,
    userId,
    role,
    ready: false,
    racing: false,
    charIndex: 0,
    finished: false,
    place: null,
    wpm: null,
    accuracy: null,
    timeMs: null,
  };
}

function resetPlayer(player: Player) {
  Object.assign(player, {
    racing: false,
    charIndex: 0,
    finished: false,
    place: null,
    wpm: null,
    accuracy: null,
    timeMs: null,
  });
}

function clearTimers(room: Room) {
  room.timeouts.forEach(clearTimeout);
  room.timeouts = [];
  if (room.ticker) clearInterval(room.ticker);
  room.ticker = null;
}

const riders = (room: Room) => [...room.players.values()].filter((p) => p.role === "rider");
const racers = (room: Room) => [...room.players.values()].filter((p) => p.racing);

function playerList(room: Room): PublicPlayer[] {
  return [...room.players.entries()].map(([id, p]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out so they stay on the server
    const { clientId, userId, ...shared } = p;
    return { id, ...shared, progress: room.text ? p.charIndex / room.text.length : 0 };
  });
}

/** What clients are allowed to see about a room. */
function publicRoom(room: Room): PublicRoom {
  return {
    code: room.code,
    status: room.status,
    raceId: room.raceId,
    hostId: room.hostId,
    hostAway: room.hostId === null && room.players.size > 0,
    text: room.status === "lobby" ? "" : room.text,
    // Relative time instead of a timestamp, so clients with wrong clocks still sync.
    startsIn: room.status === "countdown" ? Math.max(0, room.startAt - Date.now()) : 0,
    players: playerList(room),
  };
}

function broadcastRoom(io: IO, room: Room) {
  io.to(room.code).emit("roomUpdate", publicRoom(room));
}

function startCountdown(io: IO, room: Room, starters: Player[]) {
  room.status = "countdown";
  room.raceId++;
  room.text = pickText();
  room.startAt = Date.now() + COUNTDOWN_MS;
  room.players.forEach(resetPlayer);
  starters.forEach((p) => {
    p.racing = true;
  });
  broadcastRoom(io, room);
  room.timeouts.push(setTimeout(() => startRace(io, room), COUNTDOWN_MS));
}

function startRace(io: IO, room: Room) {
  room.status = "racing";
  broadcastRoom(io, room);
  room.ticker = setInterval(() => {
    const positions = playerList(room)
      .filter((p) => p.racing)
      .map(({ id, progress }) => ({ id, progress }));
    io.to(room.code).emit("positions", positions);
  }, TICK_MS);
  room.timeouts.push(setTimeout(() => endRace(io, room), MAX_RACE_MS));
}

function endRace(io: IO, room: Room) {
  clearTimers(room);
  room.status = "finished";
  // Save results before telling anyone: by now every finisher has reported
  // their accuracy, so the stored row is complete.
  racers(room).forEach((player) =>
    recordRace(room, player).catch((err) => console.error("could not save a race result", err)),
  );
  broadcastRoom(io, room);
}

function endIfEveryoneFinished(io: IO, room: Room) {
  const field = racers(room);
  if (room.status === "racing" && field.length > 0 && field.every((p) => p.finished)) {
    endRace(io, room);
  }
}

function backToLobby(io: IO, room: Room) {
  clearTimers(room);
  room.status = "lobby";
  room.text = "";
  room.players.forEach((p) => {
    resetPlayer(p);
    p.ready = false;
  });
  broadcastRoom(io, room);
}

/** Hands the empty host seat to the longest-present player. */
function promoteHost(io: IO, room: Room) {
  room.hostTimeout = null;
  if (room.hostId !== null || room.players.size === 0) return;

  const [nextId, nextPlayer] = [...room.players.entries()][0];
  nextPlayer.role = "host";
  nextPlayer.ready = false;
  nextPlayer.racing = false;
  room.hostId = nextId;
  room.hostClientId = nextPlayer.clientId ?? null;
  broadcastRoom(io, room);
}

function currentRoom(socket: ClientSocket): Room | undefined {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined;
}

function isHost(room: Room | undefined, socket: ClientSocket) {
  return room?.hostId === socket.id;
}

function leaveCurrentRoom(io: IO, socket: ClientSocket) {
  const room = currentRoom(socket);
  socket.data.roomCode = null;
  if (!room) return;

  const wasHost = room.hostId === socket.id;
  room.players.delete(socket.id);
  socket.leave(room.code);

  if (room.players.size === 0) {
    clearTimers(room);
    if (room.hostTimeout) clearTimeout(room.hostTimeout);
    rooms.delete(room.code);
    return;
  }

  // Hold the seat open first: a refresh shouldn't hand the room to someone
  // else. If nobody returns, the longest-present player inherits it.
  if (wasHost) {
    room.hostId = null;
    if (room.hostTimeout) clearTimeout(room.hostTimeout);
    room.hostTimeout = setTimeout(() => promoteHost(io, room), HOST_RECLAIM_MS);
  }

  broadcastRoom(io, room);
  endIfEveryoneFinished(io, room);
}

export function registerRoomHandlers(io: IO, socket: ClientSocket) {
  socket.on("joinRoom", (payload, reply = () => {}) => {
    const { color, role, clientId } = payload ?? {};
    const code = String(payload?.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const name = String(payload?.name ?? "").trim().slice(0, 16) || "Chocobo";
    const wantsHost = role === "host";
    if (!code) return reply({ error: "That room code isn't valid." });

    leaveCurrentRoom(io, socket);

    let room = rooms.get(code);
    if (!room) {
      // Only a host opens a room; riders need a room that already exists.
      if (!wantsHost) {
        return reply({ error: "No race with that code. Ask the host for the invite link." });
      }
      room = createRoom(code);
      rooms.set(code, room);
    }
    if (room.status !== "lobby") {
      return reply({ error: "A race is already running in this room. Try again when it's over." });
    }

    // Yours if it's free, or if you're the host returning after a reload
    // (same tab, same client id) — even during the hold-open window.
    const returningHost = Boolean(clientId) && room.hostClientId === clientId;
    const seatFree = room.hostId === null;
    const takenHost = wantsHost && !seatFree;
    const finalRole: Role = wantsHost && seatFree ? "host" : "rider";
    if (finalRole === "host" && !returningHost && room.hostClientId && room.hostTimeout) {
      return reply({ error: "The host dropped out and may be reconnecting. Try again in a moment." });
    }

    if (finalRole === "rider" && riders(room).length >= MAX_RIDERS) {
      return reply({ error: "This room is full." });
    }

    const user = socket.data.user ?? null;
    room.players.set(
      socket.id,
      newPlayer(name, safeColor(color, user), finalRole, clientId ?? null, user?.id ?? null),
    );
    if (finalRole === "host") {
      room.hostId = socket.id;
      room.hostClientId = clientId ?? null;
      if (room.hostTimeout) clearTimeout(room.hostTimeout);
      room.hostTimeout = null;
    }
    socket.join(code);
    socket.data.roomCode = code;
    reply({
      ok: true,
      role: finalRole,
      note: takenHost ? "This room already has a host, so you joined as a rider." : null,
    });
    broadcastRoom(io, room);
  });

  socket.on("toggleReady", () => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room || !player || player.role !== "rider" || room.status !== "lobby") return;

    player.ready = !player.ready;
    broadcastRoom(io, room);
  });

  socket.on("startRace", (_payload, reply = () => {}) => {
    const room = currentRoom(socket);
    if (!room || !isHost(room, socket)) return reply({ error: "Only the host can start the race." });
    if (room.status !== "lobby") return reply({ error: "The race has already started." });

    const starters = riders(room).filter((p) => p.ready);
    if (starters.length === 0) return reply({ error: "No riders are ready yet." });

    startCountdown(io, room, starters);
    reply({ ok: true });
  });

  socket.on("progress", (charIndex) => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room || !player || !player.racing || room.status !== "racing" || player.finished) return;

    const n = Math.floor(Number(charIndex));
    if (!Number.isFinite(n) || n <= player.charIndex) return;

    const elapsedSec = (Date.now() - room.startAt) / 1000;
    if (n > elapsedSec * MAX_CHARS_PER_SEC + 10) return; // impossibly fast: ignore

    player.charIndex = Math.min(n, room.text.length);

    if (player.charIndex === room.text.length) {
      player.finished = true;
      player.place = racers(room).filter((p) => p.finished).length;
      player.wpm = Math.round(room.text.length / 5 / (elapsedSec / 60));
      player.timeMs = Math.round(elapsedSec * 1000);
      broadcastRoom(io, room);
      endIfEveryoneFinished(io, room);
    }
  });

  // Accuracy is counted in the browser, so the rider reports their own.
  socket.on("stats", (stats) => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room || !player || !player.racing) return;

    const value = Number(stats?.accuracy);
    if (!Number.isFinite(value)) return;
    player.accuracy = Math.max(0, Math.min(100, Math.round(value)));
    broadcastRoom(io, room);
  });

  socket.on("playAgain", () => {
    const room = currentRoom(socket);
    if (!room || !isHost(room, socket) || room.status !== "finished") return;
    backToLobby(io, room);
  });

  socket.on("leaveRoom", () => leaveCurrentRoom(io, socket));
  socket.on("disconnect", () => leaveCurrentRoom(io, socket));
}
