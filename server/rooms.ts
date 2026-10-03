// The referee, and the only authority on a race. Clients send the keys they
// pressed and nothing else; whether those keys were right, and so positions,
// accuracy, finish order, WPM, and who may ride what, are all decided here.
// One host (who never types) per room.
//
// A race moves through four states, and only ever forwards:
//
//   lobby ──startRace (host, ≥2 ready)──▶ countdown ──3 s──▶ racing
//     ▲                                                        │ everyone finished,
//     └────────────── playAgain (host) ◀──── finished ◀────────┘ 30 s after the first
//                                                                finisher, or 3 min
import { randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { pickText } from "./texts";
import { recordRace } from "./stats";
import { ackOf, botLevel, joinPayload, parse, playerId, setWatchingArgs, settingsChange, typedArgs } from "./schemas";
import {
  FINISH_GRACE_MS,
  MAX_RIDERS,
  MIN_RIDERS,
  RECONNECT_MS,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  scoreOf,
} from "../lib/rules";
import { accuracyOf, correctPrefixLength, EMPTY_STATE, replayKeys, type TypingState } from "../lib/typing";
import { planBot, seedOf, type BotKey, type BotLevel } from "../lib/bots";
import type {
  ActionReply,
  ClientToServerEvents,
  ErrorCode,
  JoinReply,
  PublicPlayer,
  PublicRoom,
  Role,
  RoomSettings,
  RoomStatus,
  ServerToClientEvents,
  TextLanguage,
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
  watching: boolean; // COURSE-6: the host put this rider in the stands; stays there across races
  racing: boolean; // taking part in the current race (late arrivals watch until the next one)
  typing: TypingState; // the server's own copy of the typing engine for this rider; never sent to anyone
  charIndex: number; // how many characters from the start are right, according to `typing`
  finished: boolean;
  place: number | null;
  wpm: number | null;
  accuracy: number | null;
  timeMs: number | null;
  score: number | null; // wpm × accuracy, set on finishing; decides the final places
  away: boolean; // dropped mid-race; the lane is held for RECONNECT_MS
  bot: BotLevel | null; // a bot (BOT-01), and its level; null for a person
  botPlan: BotKey[]; // the keys this bot will press in the current race (lib/bots.ts)
  botNext: number; // index of the next key in botPlan to play
}

export interface Room {
  code: string;
  status: RoomStatus;
  raceId: number; // goes up by one every race
  text: string;
  startAt: number;
  finishAt: number | null; // deadline set when the first rider crosses the line
  settings: RoomSettings; // chosen by the host in the lobby; every rider sees them live
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
const MAX_KEYS_PER_REPORT = 2000; // a report is one word plus its corrections; anything longer isn't typing
const TYPED_ARGS = typedArgs(MAX_KEYS_PER_REPORT);
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

function createRoom(code: string, language: TextLanguage): Room {
  return {
    code,
    status: "lobby",
    raceId: 0,
    text: "",
    startAt: 0,
    finishAt: null,
    settings: { language, kind: "sentences", hostRides: false },
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
    watching: false,
    racing: false,
    typing: EMPTY_STATE,
    charIndex: 0,
    finished: false,
    place: null,
    wpm: null,
    accuracy: null,
    timeMs: null,
    score: null,
    away: false,
    bot: null,
    botPlan: [],
    botNext: 0,
  };
}

// Bots (BOT-01 to BOT-05; ADR-002 in docs/ARCHITECTURE.md). A bot is a rider
// with no socket, always ready, that the host adds in the lobby. Its keys are
// planned from a seed when the race starts (lib/bots.ts) and played back by
// the race ticker through the same rules as a person's keys.
const BOT_NAMES = ["Boko", "Kweh", "Gysahl", "Pecky", "Wark", "Choco", "Feathers", "Sprout", "Mimic", "Biggs", "Wedge", "Dash"];
const BOT_COLORS = ["yellow", "red", "blue", "green", "black", "gold"];
let botCounter = 0;

function addBot(room: Room, level: BotLevel): string {
  const taken = new Set([...room.players.values()].map((p) => p.name));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${botCounter + 1}`;
  const id = `bot-${++botCounter}`;
  const bot = newPlayer(name, BOT_COLORS[botCounter % BOT_COLORS.length], "rider", null, null);
  bot.bot = level;
  bot.ready = true;
  room.players.set(id, bot);
  return id;
}

const isHuman = (p: Player) => p.bot === null;

function resetPlayer(player: Player) {
  Object.assign(player, {
    racing: false,
    typing: EMPTY_STATE,
    charIndex: 0,
    finished: false,
    place: null,
    wpm: null,
    accuracy: null,
    timeMs: null,
    score: null,
  });
}

function clearTimers(room: Room) {
  room.timeouts.forEach(clearTimeout);
  room.timeouts = [];
  if (room.ticker) clearInterval(room.ticker);
  room.ticker = null;
}

const riders = (room: Room) => [...room.players.values()].filter((p) => p.role === "rider");
// Who lines up when the host presses Start: the ready riders, plus the host
// when they chose to ride (COURSE-5). A host who watches doesn't count
// towards the minimum (H-12).
const starters = (room: Room) =>
  [...room.players.values()].filter((p) =>
    p.role === "host" ? room.settings.hostRides && !p.away : p.ready && !p.watching,
  );
const racers = (room: Room) => [...room.players.values()].filter((p) => p.racing);
const raceInProgress = (room: Room) => room.status === "countdown" || room.status === "racing";

function playerList(room: Room): PublicPlayer[] {
  return [...room.players.entries()].map(([id, p]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out so they stay on the server
    const { clientId, userId, typing, botPlan, botNext, ...shared } = p;
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
    settings: room.settings,
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
  // BOT-05: the seed comes from the room, the race and the bot, so a race can
  // be replayed exactly, and two bots of the same level don't type in step.
  for (const [id, p] of room.players) {
    if (p.bot && p.racing) {
      p.botPlan = planBot({ seed: seedOf(`${room.code}:${room.raceId}:${id}`), text, level: p.bot });
      p.botNext = 0;
    }
  }
  broadcastRoom(io, room);
  room.timeouts.push(setTimeout(() => startRace(io, room), COUNTDOWN_MS));
}

/** Plays every bot's keys that are due by now. */
function driveBots(io: IO, room: Room) {
  const now = Date.now();
  const elapsed = now - room.startAt;
  for (const player of room.players.values()) {
    if (!player.bot || !player.racing || player.finished) continue;
    let keys = "";
    while (player.botNext < player.botPlan.length && player.botPlan[player.botNext].atMs <= elapsed) {
      keys += player.botPlan[player.botNext++].key;
    }
    if (keys) advance(io, room, player, replayKeys(player.typing, keys, room.text, now), now);
    if (room.status !== "racing") return; // that key ended the race
  }
}

/**
 * Takes a rider's new typing state, judged by the server, and moves them on:
 * progress, and if they reached the end, their result. Humans (the `typed`
 * event) and bots (driveBots) both come through here.
 */
function advance(io: IO, room: Room, player: Player, typing: TypingState, now: number) {
  const n = correctPrefixLength(typing.input, room.text);
  const elapsedSec = (now - room.startAt) / 1000;
  if (n > elapsedSec * MAX_CHARS_PER_SEC + 10) return; // impossibly fast: ignore

  player.typing = typing;
  player.charIndex = n;

  if (n === room.text.length) {
    player.finished = true;
    player.wpm = Math.round(room.text.length / 5 / (elapsedSec / 60));
    player.timeMs = Math.round(elapsedSec * 1000);
    player.accuracy = accuracyOf(typing.keystrokes, typing.mistakes);
    player.score = scoreOf(player.wpm, player.accuracy);
    startFinishClock(io, room);
    broadcastRoom(io, room);
    endIfEveryoneFinished(io, room);
  }
}

function startRace(io: IO, room: Room) {
  room.status = "racing";
  broadcastRoom(io, room);
  room.ticker = setInterval(() => {
    driveBots(io, room);
    const positions = playerList(room)
      .filter((p) => p.racing)
      .map(({ id, progress }) => ({ id, progress }));
    io.to(room.code).emit("positions", positions);
  }, TICK_MS);
  room.timeouts.push(setTimeout(() => endRace(io, room), MAX_RACE_MS));
}

// TXT-9: the ranking punishes fast but sloppy typing. Places go by score
// (wpm × accuracy) among the riders who finished, so crossing the line first
// isn't enough on its own. Equal scores go to whoever crossed first.
// Riders who didn't finish get no place (DNF).
function rankFinishers(room: Room) {
  const finishers = racers(room).filter((p) => p.finished);
  finishers.sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity),
  );
  finishers.forEach((p, i) => {
    p.place = i + 1;
  });
}

function endRace(io: IO, room: Room) {
  clearTimers(room);
  room.status = "finished";
  room.finishAt = null;
  rankFinishers(room);
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
    p.ready = p.bot !== null; // bots are always ready
  });
  broadcastRoom(io, room);
}

/** Hands the empty host seat to the longest-present player who is actually here. */
function promoteHost(io: IO, room: Room) {
  room.hostTimeout = null;
  if (room.hostId !== null || room.players.size === 0) return;

  // SALLE-08: the seat goes to a person, never to a bot.
  const next = [...room.players.entries()].find(([, p]) => !p.away && isHuman(p));
  if (!next) return;
  const [nextId, nextPlayer] = next;
  // The old host may still be in the room, away mid-race with their lane
  // held: they come back as a rider, since the seat is taken.
  room.players.forEach((p) => {
    if (p.role === "host") p.role = "rider";
  });
  nextPlayer.role = "host";
  nextPlayer.watching = false;
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

  // Bots don't keep a room open on their own.
  if (![...room.players.values()].some(isHuman)) {
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

  const wasHost = room.hostId === socket.id;

  // Anyone in this race (still typing, or finished and looking at the
  // results), the riding host included, gets their lane held rather than
  // dropped, so a reload doesn't erase their progress or their place. This
  // also covers React mounting the room page twice in dev mode, which sends
  // leave-then-join on a reload.
  if (player.racing && player.clientId && room.status !== "lobby") {
    holdLane(io, room, socket.id, player);
    // A riding host also frees the seat, held the same way as below.
    if (wasHost) {
      room.hostId = null;
      if (room.hostTimeout) clearTimeout(room.hostTimeout);
      room.hostTimeout = setTimeout(() => promoteHost(io, room), HOST_RECLAIM_MS);
      broadcastRoom(io, room);
    }
    return;
  }

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

// SALLE-02: codes are made here, never by a browser. A host first asks for
// one (POST /api/rooms), then opens the room by joining it. The code is held
// for a few minutes so nobody else can be handed it in between, and a host
// can't open a room on a code the server didn't issue.
const RESERVATION_MS = 5 * 60_000;
const reservedCodes = new Map<string, number>(); // code → expiry time

export function reserveRoomCode(): string {
  const now = Date.now();
  for (const [code, expires] of reservedCodes) {
    if (expires <= now) reservedCodes.delete(code);
  }
  for (;;) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]).join("");
    if (!rooms.has(code) && !reservedCodes.has(code)) {
      reservedCodes.set(code, now + RESERVATION_MS);
      return code;
    }
  }
}

function claimReservedCode(code: string): boolean {
  const expires = reservedCodes.get(code);
  reservedCodes.delete(code);
  return expires !== undefined && expires > Date.now();
}

export function registerRoomHandlers(io: IO, socket: ClientSocket) {
  socket.on("joinRoom", (payload, ack) => {
    const reply = ackOf<JoinReply>(ack);
    const parsed = parse(joinPayload, payload);
    if (!parsed.ok) return reply({ error: parsed.error });
    const { code, name, color, role, clientId, lang } = parsed.data;
    const wantsHost = role === "host";

    leaveCurrentRoom(io, socket);

    let room = rooms.get(code);
    if (!room) {
      // Only a host opens a room, on a code the server issued; riders need a
      // room that already exists.
      if (!wantsHost || !claimReservedCode(code)) {
        return reply({ error: "no-room" });
      }
      room = createRoom(code, lang ?? "en");
      rooms.set(code, room);
    }

    // The same tab coming back mid-race: hand it its lane and progress back.
    const held = clientId
      ? [...room.players.entries()].find(([, p]) => p.away && p.clientId === clientId)
      : undefined;
    if (held) {
      const player = reclaimLane(room, held[0], socket.id);
      // A riding host who reloaded gets the seat back too, unless it has
      // been handed on in the meantime (then promoteHost made them a rider).
      if (player.role === "host") {
        room.hostId = socket.id;
        if (room.hostTimeout) clearTimeout(room.hostTimeout);
        room.hostTimeout = null;
      }
      socket.join(code);
      socket.data.roomCode = code;
      reply({ ok: true, role: player.role, note: null });
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
      return reply({ error: "host-reconnecting" });
    }

    if (finalRole === "rider" && riders(room).length >= MAX_RIDERS) {
      return reply({ error: "room-full" });
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
      note: takenHost ? "host-taken" : lateArrival ? "late-arrival" : null,
    });
    broadcastRoom(io, room);
  });

  socket.on("toggleReady", () => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    if (!room || !player || player.role !== "rider" || player.watching || room.status !== "lobby") return;

    player.ready = !player.ready;
    broadcastRoom(io, room);
  });

  socket.on("startRace", async (_payload, ack) => {
    const reply = ackOf<ActionReply>(ack);
    const room = currentRoom(socket);
    const check = (): ErrorCode | null => {
      if (!room || !isHost(room, socket)) return "host-only";
      if (room.status !== "lobby") return "already-started";
      if (starters(room).length < MIN_RIDERS) return "need-riders";
      if (!starters(room).some(isHuman)) return "need-human"; // COURSE-02: bots count, but not alone
      return null;
    };
    const problem = check();
    if (problem) return reply({ error: problem });

    let text: string;
    try {
      text = await pickText(room!.settings);
    } catch (err) {
      console.error("could not load a race text", err);
      return reply({ error: "text-failed" });
    }

    // The database answered asynchronously: a second click, a rider un-readying
    // or the host leaving may have happened in the meantime, so check again.
    const late = check();
    if (late) return reply({ error: late });
    startCountdown(io, room!, starters(room!), text);
    reply({ ok: true });
  });

  // COURSE-11: the host's choices go out to the whole room at once, so riders
  // see the language and text type change while they wait. Lobby only: a
  // race already has its text.
  socket.on("updateSettings", (payload) => {
    const room = currentRoom(socket);
    const changes = parse(settingsChange, payload);
    if (!room || !isHost(room, socket) || room.status !== "lobby" || !changes.ok) return;

    const { language, kind, hostRides } = changes.data;
    room.settings = {
      language: language ?? room.settings.language,
      kind: kind ?? room.settings.kind,
      hostRides: hostRides ?? room.settings.hostRides,
    };
    broadcastRoom(io, room);
  });

  // COURSE-6: the host sends a rider to the stands, or lets them back in.
  // Lobby only, so nobody is pulled out of a race they're typing in.
  socket.on("setWatching", (...args) => {
    const room = currentRoom(socket);
    const parsed = parse(setWatchingArgs, args);
    if (!room || !isHost(room, socket) || room.status !== "lobby" || !parsed.ok) return;
    const [playerId, watching] = parsed.data;
    const target = room.players.get(playerId);
    if (!target || target.role !== "rider" || target.bot) return;
    target.watching = watching;
    target.ready = false;
    broadcastRoom(io, room);
  });

  // The rider's keys since their last report. The browser has its own idea
  // of which ones were right, and it isn't asked: the keys go through the
  // same rules here (lib/typing.ts), against the server's copy of the text.
  socket.on("typed", (...args) => {
    const room = currentRoom(socket);
    const player = room?.players.get(socket.id);
    const parsed = parse(TYPED_ARGS, args);
    if (!room || !player || !player.racing || player.finished || room.status !== "racing" || !parsed.ok) return;
    const [base, keys] = parsed.data;
    // Reports continue from where the server is. One that starts behind was
    // already counted (resent after a reconnect); one that starts ahead
    // follows a report that never arrived.
    if (base !== player.charIndex) return;

    const now = Date.now();
    // A report starts after the last correct character: anything wrong typed
    // beyond it by an earlier report is dropped (its mistakes stay counted).
    const from = { ...player.typing, input: room.text.slice(0, player.charIndex) };
    advance(io, room, player, replayKeys(from, keys, room.text, now), now);
  });

  // CONF-10: the host adds and removes bots in the lobby. They count towards
  // the room's capacity like anyone else.
  socket.on("addBot", (payload) => {
    const room = currentRoom(socket);
    const level = parse(botLevel, payload);
    if (!room || !isHost(room, socket) || room.status !== "lobby" || !level.ok) return;
    if (riders(room).length >= MAX_RIDERS) return;
    addBot(room, level.data);
    broadcastRoom(io, room);
  });

  socket.on("removeBot", (payload) => {
    const room = currentRoom(socket);
    const id = parse(playerId, payload);
    if (!room || !isHost(room, socket) || room.status !== "lobby" || !id.ok) return;
    if (!room.players.get(id.data)?.bot) return;
    room.players.delete(id.data);
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
