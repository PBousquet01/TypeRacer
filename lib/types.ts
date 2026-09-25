// The shapes that cross the wire. Both the server and the browser import
// these, so a change here shows up as a type error on whichever side hasn't
// caught up.

export type Role = "host" | "rider";

export type RoomStatus = "lobby" | "countdown" | "racing" | "finished";

/** A rider as everyone in the room sees them. */
export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  role: Role;
  ready: boolean;
  racing: boolean;
  charIndex: number;
  finished: boolean;
  place: number | null;
  wpm: number | null;
  accuracy: number | null;
  timeMs: number | null;
  progress: number; // 0..1
}

export interface PublicRoom {
  code: string;
  status: RoomStatus;
  raceId: number;
  hostId: string | null;
  hostAway: boolean;
  text: string;
  startsIn: number;
  players: PublicPlayer[];
}

export interface Position {
  id: string;
  progress: number;
}

/** What the browser keeps about the rider in this tab. */
export interface Profile {
  name: string;
  color: string;
  role: Role;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  unlocks: string[];
}

export interface JoinPayload extends Partial<Profile> {
  code: string;
  clientId: string | null;
}

export type JoinReply = { ok: true; role: Role; note: string | null } | { error: string };
export type ActionReply = { ok: true } | { error: string };

// Everything the browser may send. The server still checks every value:
// these types describe well-behaved clients, not what arrives on the socket.
export interface ClientToServerEvents {
  joinRoom: (payload: JoinPayload, reply?: (res: JoinReply) => void) => void;
  toggleReady: () => void;
  startRace: (payload: null, reply?: (res: ActionReply) => void) => void;
  progress: (charIndex: number) => void;
  stats: (stats: { accuracy: number }) => void;
  playAgain: () => void;
  leaveRoom: () => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: PublicRoom) => void;
  positions: (positions: Position[]) => void;
}

export interface StatsSummary {
  races: number;
  bestWpm: number | null;
  avgWpm: number | null;
  avgAccuracy: number | null;
  wins: number;
}

export interface RecentRace {
  roomCode: string;
  wpm: number;
  accuracy: number | null;
  timeMs: number | null;
  place: number | null;
  riders: number;
  finishedAt: string;
}

export interface LeaderboardRow {
  name: string;
  wpm: number;
  races: number;
  wins: number;
}
