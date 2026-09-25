// The referee, and the only authority on a race. Clients send nothing but
// "I typed N correct characters"; positions, finish order, WPM and who may
// ride what are all decided here. One host (who never types) per room.
//
// A race moves through four states, and only ever forwards:
//
//   lobby ──startRace (host, ≥2 ready)──▶ countdown ──3 s──▶ racing
//     ▲                                                        │ everyone finished,
//     └────────────── playAgain (host) ◀──── finished ◀────────┘ 30 s after the first
//                                                                finisher, or 3 min
import type { Server, Socket } from "socket.io";
import { pickText } from "./texts";
import { recordRace } from "./stats";
import { FINISH_GRACE_MS, MAX_RIDERS, MIN_RIDERS, RECONNECT_MS } from "../lib/rules";
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
type Timer = ReturnType<typeof setTimeout>;

export interface Player {
  name: string;
  color: string;
  clientId: string | null; // never shown to anyone; recognises the same tab after a reload
  userId: number | null; // set when this rider is signed in; their results get saved
  role: Role;
  ready: boolean;
  racing: boolean; // taking part in the current race (late arrivals watch until the next one)
  charIndex: number;
  finished: boolean;
  place: number | null;
  wpm: number | null;
  accuracy: number | null;
  timeMs: number | null;
  away: boolean; // dropped mid-race; the lane is held for RECONNECT_MS
}

export interface Room {
  code: string;
  status: RoomStatus;
  raceId: number; // goes up by one every race
  text: string;
  startAt: number;
  finishAt: number | null; // deadline set when the first rider crosses the line
  players: Map<string, Player>; // socket.id -> player (insertion order matters: oldest inherits the host seat)
  hostId: string | null;
  hostClientId: string | null; // survives a reload, so the same person can reclaim the seat
  hostTimeout: Timer | null;
  awayTimers: Map<string, Timer>; // clientId -> removal timer for a rider who dropped mid-race
  timeouts: Timer[];
  ticker: ReturnType<typeof setInterval> | null;
}

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
    finishAt: null,
    players: new Map(),
    hostId: null,
    hostClientId: null,
    hostTimeout: null,
    awayTimers: new Map(),
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
    away: false,
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
const raceInProgress = (room: Room) => room.status === "countdown" || room.status === "racing";

function playerList(room: Room): PublicPlayer[] {
  return [...room.players.entries()].map(([id, p]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out so they stay on the server
    const { clientId, userId, ...shared } = p;
    return { id, ...shared, progress: room.text ? p.charIndex / room.text.length : 0 };
  });
}

/** What clients are allowed to see about a room. */
function publicRoom(room: Room): PublicRoom {
  const now = Date.now();
  return {
    code: room.code,
    status: room.status,
    raceId: room.raceId,
    hostId: room.hostId,
    hostAway: room.hostId === null && room.players.size > 0,
    text: room.status === "lobby" ? "" : room.text,
    // Relative times instead of timestamps, so clients with wrong clocks still sync.
    startsIn: room.status === "countdown" ? Math.max(0, room.startAt - now) : 0,
    elapsedMs: room.status === "racing" ? Math.max(0, now - room.startAt) : 0,
    finishIn: room.status === "racing" && room.finishAt ? Math.max(0, room.finishAt - now) : null,
    players: playerList(room),
  };
}

function broadcastRoom(io: IO, room: Room) {
  io.to(room.code).emit("roomUpdate", publicRoom(room));
}

function startCountdown(io: IO, room: Room, starters: Player[], text: string) {
  room.status = "countdown";
  room.raceId++;
  room.text = text;
  room.startAt = Date.now() + COUNTDOWN_MS;
  room.finishAt = null;
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
  room.finishAt = null;
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

// COURSE-15: the winner shouldn't have to wait three minutes for someone who
// walked away from the keyboard. The first finish starts a short last call.
function startFinishClock(io: IO, room: Room) {
  if (room.finishAt) return;
  room.finishAt = Date.now() + FINISH_GRACE_MS;
  room.timeouts.push(setTimeout(() => endRace(io, room), FINISH_GRACE_MS));
}

function backToLobby(io: IO, room: Room) {
  clearTimers(room);
  room.status = "lobby";
  room.text = "";
  room.finishAt = null;
  // Anyone still away missed the race and the results; their lane isn't
  // worth holding into the next one.
  for (const [id, p] of room.players) {
    if (p.away) removePlayer(io, room, id, { broadcast: false });
  }
  room.players.forEach((p) => {
    resetPlayer(p);
    p.ready = false;
  });
  broadcastRoom(io, room);
}

/** Hands the empty host seat to the longest-present player who is actually here. */
function promoteHost(io: IO, room: Room) {
  room.hostTimeout = null;
  if (room.hostId !== null || room.players.size === 0) return;

  const next = [...room.players.entries()].find(([, p]) => !p.away);
  if (!next) return;
  const [nextId, nextPlayer] = next;
  nextPlayer.role = "host";
  nextPlayer.ready = false;
  nextPlayer.racing = false;
  room.hostId = nextId;
  room.hostClientId = nextPlayer.clientId ?? null;
  broadcastRoom(io, room);
}

/** Takes a player out for good, and closes the room if they were the last one. */
function removePlayer(io: IO, room: Room, id: string, { broadcast = true } = {}) {
  const player = room.players.get(id);
  if (!player) return;
  room.players.delete(id);
  if (player.clientId) {
    clearTimeout(room.awayTimers.get(player.clientId));
    room.awayTimers.delete(player.clientId);
  }

  if (room.players.size === 0) {
    clearTimers(room);
    if (room.hostTimeout) clearTimeout(room.hostTimeout);
    room.awayTimers.forEach(clearTimeout);
    rooms.delete(room.code);
    return;
  }
  if (broadcast) {
    broadcastRoom(io, room);
    endIfEveryoneFinished(io, room);
  }
}

// COURSE-14: a rider who drops mid-race (reload, Wi-Fi blip) keeps their lane
// and progress for RECONNECT_MS. The same tab coming back with the same
// clientId takes it over; otherwise the lane is dropped and they DNF.
function holdLane(io: IO, room: Room, id: string, player: Player) {
  player.away = true;
  const clientId = player.clientId!;
  room.awayTimers.set(
    clientId,
    setTimeout(() => removePlayer(io, room, id), RECONNECT_MS),
  );
  broadcastRoom(io, room);
}

/** Moves a held player onto their new socket, keeping their place in the join order. */
function reclaimLane(room: Room, oldId: string, newId: string) {
  const player = room.players.get(oldId)!;
  clearTimeout(room.awayTimers.get(player.clientId!));
  room.awayTimers.delete(player.clientId!);
  player.away = false;
  room.players = new Map([...room.players].map(([id, p]) => (id === oldId ? [newId, p] : [id, p])));
  return player;
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

  const player = room.players.get(socket.id);
  socket.leave(room.code);
  if (!player) return;

  // A rider in this race (still typing, or finished and looking at the
  // results) gets their lane held rather than dropped, so a reload doesn't
  // erase their progress or their place. This also covers React mounting the
  // room page twice in dev mode, which sends leave-then-join on a reload.
  if (player.role === "rider" && player.racing && player.clientId && room.status !== "lobby") {
    holdLane(io, room, socket.id, player);
    return;
  }

  const wasHost = room.hostId === socket.id;
  removePlayer(io, room, socket.id, { broadcast: false });
  if (!rooms.has(room.code)) return;

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

    // The same tab coming back mid-race: hand it its lane and progress back.
    const held = clientId
      ? [...room.players.entries()].find(([, p]) => p.away && p.clientId === clientId)
      : undefined;
    if (held) {
      reclaimLane(room, held[0], socket.id);
      socket.join(code);
      socket.data.roomCode = code;
      reply({ ok: true, role: "rider", note: null });
      broadcastRoom(io, room);
      return;
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

    // COURSE-7: arriving mid-race is allowed. The new rider isn't `racing`,
    // so they watch this one and ready up for the next.
    const lateArrival = finalRole === "rider" && raceInProgress(room);

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
      note: takenHost
        ? "This room already has a host, so you joined as a rider."
        : lateArrival
          ? "A race is already running. You're watching this one and can ride the next."
          : null,
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

  socket.on("startRace", async (_payload, reply = () => {}) => {
    const room = currentRoom(socket);
    const check = () => {
      if (!room || !isHost(room, socket)) return "Only the host can start the race.";
      if (room.status !== "lobby") return "The race has already started.";
      if (riders(room).filter((p) => p.ready).length < MIN_RIDERS) {
        return `A race needs at least ${MIN_RIDERS} ready riders.`;
      }
      return null;
    };
    const problem = check();
    if (problem) return reply({ error: problem });

    let text: string;
    try {
      text = await pickText();
    } catch (err) {
      console.error("could not load a race text", err);
      return reply({ error: "Couldn't load a passage. Try again." });
    }

    // The database answered asynchronously: a second click, a rider un-readying
    // or the host leaving may have happened in the meantime, so check again.
    const late = check();
    if (late) return reply({ error: late });
    startCountdown(io, room!, riders(room!).filter((p) => p.ready), text);
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
      startFinishClock(io, room);
      broadcastRoom(io, room);
      endIfEveryoneFinished(io, room);
    }
  });

  // Accuracy is counted in the browser, so the rider reports their own. Only
  // the first report counts: a tab reloaded after the finish has forgotten its
  // mistakes and would otherwise overwrite the real figure with 100%.
  socket.on("stats", (stats) => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room || !player || !player.racing || player.accuracy !== null) return;

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
