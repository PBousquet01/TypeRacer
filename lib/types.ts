// The shapes that cross the wire. Both the server and the browser import
// these, so a change here shows up as a type error on whichever side hasn't
// caught up.

export type Role = "host" | "rider";

export type RoomStatus = "lobby" | "countdown" | "racing" | "finished";

import type { BotLevel } from "./bots";
import type { BonusKind } from "./bonuses";
import type { RaceStatus } from "./rules";
import type { TextOptions } from "./textgen";
import type { ErrorMode } from "./typing";

export type TextLanguage = "en" | "fr";
/** Language of the interface (UX-5). Same two as the texts, but a separate choice. */
export type Lang = "en" | "fr";

// The server sends codes, never sentences; each browser shows them in its
// own language (lib/i18n).
export type ErrorCode =
  | "bad-code"
  | "no-room"
  | "host-reconnecting"
  | "room-full"
  | "host-only"
  | "already-started"
  | "need-riders"
  | "need-human"
  | "invite-needed"
  | "invite-invalid"
  | "invite-used"
  | "kicked"
  | "no-race"
  | "sign-in-needed"
  | "image-type"
  | "image-too-big"
  | "image-unreadable"
  | "text-failed"
  | "bad-request"
  | "username-format"
  | "name-format"
  | "password-short"
  | "username-taken"
  | "oauth-cancelled"
  | "oauth-failed"
  | "oauth-unavailable"
  | "identity-taken"
  | "already-linked"
  | "wrong-credentials"
  | "sign-in-for-stats"
  | "admin-only"
  | "no-account"
  | "which-mount"
  | "unknown-endpoint"
  | "server-error"
  | "unknown";
export type Provider = "github" | "discord";
export type NoticeCode = "host-taken" | "late-arrival";
export type TextKind = "sentences" | "words";

/** Which text to type (TXT-1, TXT-7): chosen by the host for a race, or by the player in practice. */
export interface TextSettings {
  language: TextLanguage;
  kind: TextKind;
}

/**
 * SALLE-03: public rooms are listed in the explorer and offered by quick
 * play; code rooms need the code (or an invite link); private rooms need an
 * invite link, and the code alone isn't enough.
 */
export type Visibility = "public" | "code" | "private";

/** What the host chooses in the lobby. */
export interface RoomSettings extends TextSettings, Omit<TextOptions, "kind"> {
  maxTimeMs: number | null; // CONF-01: the race ends after this long; null for no limit
  errorMode: ErrorMode; // CONF-08: must mistakes be fixed, or can riders carry on
  hostRides: boolean; // COURSE-5: the host races too, instead of only watching
  visibility: Visibility;
  bonuses: boolean; // CONF-09: comeback bonuses on or off
}

/** SALLE-04: one of the host's invite links, as the host sees it. */
export interface InviteSummary {
  token: string;
  usedBy: string | null; // the name of whoever used it first; null while unused
}

/** JOIN-02: a public room as the explorer lists it. */
export interface RoomSummary {
  code: string;
  host: string | null;
  riders: number; // participants: riders and bots, plus the host when they ride
  capacity: number;
  language: TextLanguage;
  kind: TextKind;
  complexity: TextOptions["complexity"];
  status: RoomStatus;
}

/** A rider as everyone in the room sees them. */
export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  role: Role;
  ready: boolean;
  watching: boolean; // COURSE-6: put in the stands by the host; can't ready up until let back in
  racing: boolean;
  charIndex: number;
  finished: boolean;
  place: number | null;
  wpm: number | null;
  accuracy: number | null;
  timeMs: number | null;
  score: number | null; // wpm × accuracy; decides the final places (TXT-9)
  away: boolean; // dropped mid-race; their lane is held until they reconnect
  bot: BotLevel | null; // BOT-04: a bot, and how good it is; null for a person
  bonuses: BonusKind[]; // comeback bonuses this rider earned in the race (RES-02)
  textLength: number; // their own text can grow or shrink with bonuses (BONUS-04)
  // RES-03, sent once the race is over (empty before): WPM at each second, and
  // how often each character was missed.
  samples: number[];
  missed: Record<string, number>;
  personalBest: boolean; // RES-04: a signed-in rider who beat their best WPM in this race
  // RES-02, set when the race ends: every key typed per minute, wrong keys, and how it ended.
  rawWpm: number | null;
  errors: number | null;
  status: RaceStatus | null;
  progress: number; // 0..1, against their own text
}

/** BONUS-03: a bonus being played, announced to the whole room. */
export interface BonusEvent {
  kind: BonusKind;
  from: string; // the lagging rider who earned it
  target: string; // whose race it changes
  durationMs: number; // how long it lasts on screen (the fog's length)
}

export interface PublicRoom {
  code: string;
  status: RoomStatus;
  raceId: number;
  hostId: string | null;
  hostAway: boolean;
  text: string;
  startsIn: number;
  elapsedMs: number; // since the gates opened, so a reloaded client can resync its clock
  finishIn: number | null; // set once the first rider finishes: time left for everyone else
  settings: RoomSettings;
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
  linked: Provider[]; // GitHub / Discord accounts attached to this one (AUTH-3)
  avatarUrl: string | null; // AUTH-04: their profile photo; null shows a generated avatar
}

export interface JoinPayload extends Partial<Profile> {
  code: string;
  clientId: string | null;
  lang?: Lang; // the joiner's interface language; a new room's texts start in it
  invite?: string; // SALLE-04: the token from an invite link, if they came through one
}

export type JoinReply = { ok: true; role: Role; note: NoticeCode | null } | { error: ErrorCode };
export type ActionReply = { ok: true } | { error: ErrorCode };

// Everything the browser may send. The server still checks every value:
// these types describe well-behaved clients, not what arrives on the socket.
export interface ClientToServerEvents {
  joinRoom: (payload: JoinPayload, reply?: (res: JoinReply) => void) => void;
  toggleReady: () => void;
  startRace: (payload: null, reply?: (res: ActionReply) => void) => void;
  updateSettings: (settings: Partial<RoomSettings>) => void;
  setWatching: (playerId: string, watching: boolean) => void; // host only, lobby only (COURSE-6)
  addBot: (level: BotLevel) => void; // host only, lobby only (CONF-10)
  removeBot: (playerId: string) => void; // host only, lobby only (CONF-10)
  kickPlayer: (playerId: string) => void; // host only (SALLE-07)
  // The keys pressed since the last report ("\b" for a backspace), and how
  // many characters were right before them. No verdict: the server judges.
  typed: (base: number, keys: string) => void;
  playAgain: () => void;
  leaveRoom: () => void;
  createInvite: (payload: null, reply?: (res: { ok: true; token: string } | { error: ErrorCode }) => void) => void; // host only
  watchRooms: () => void; // JOIN-02: start receiving roomList
  unwatchRooms: () => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: PublicRoom) => void;
  roomList: (rooms: RoomSummary[]) => void; // JOIN-02, to sockets watching the explorer
  inviteList: (invites: InviteSummary[]) => void; // SALLE-04, to the host only
  yourText: (text: string) => void; // BONUS-04: this rider's own text, after a bonus changed it
  kicked: () => void; // SALLE-07: the host put this person out of the room
  bonus: (event: BonusEvent) => void; // BONUS-03
  positions: (positions: Position[]) => void;
}

export interface StatsSummary {
  races: number;
  bestScore: number | null;
  bestWpm: number | null;
  avgWpm: number | null;
  avgAccuracy: number | null;
  wins: number;
}

/** HIST-01: one race in a rider's history. */
export interface RecentRace {
  runId: number | null; // HIST-02: its full results can be shown again; null for races saved before that existed
  roomCode: string;
  wpm: number;
  accuracy: number | null;
  timeMs: number | null;
  place: number | null;
  score: number | null;
  riders: number;
  finishedAt: string; // ISO date; each browser formats it in its own language
}

/** AUTH-06: one race on the profile's progress chart. */
export interface ProgressPoint {
  at: string; // ISO date
  wpm: number;
}

/** HIST-01: a page of the history. */
export interface HistoryPage {
  races: RecentRace[];
  page: number;
  pages: number;
}

/** HIST-02: a past race's results, as they were shown when it ended. */
export interface PastRace {
  id: number;
  roomCode: string;
  finishedAt: string;
  bonuses: boolean;
  players: PublicPlayer[];
  myId: string | null; // which of the players is the person asking
}

export interface LeaderboardRow {
  name: string;
  score: number;
  wpm: number;
  races: number;
  wins: number;
}
