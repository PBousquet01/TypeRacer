# Chocobo Race — project summary

Orientation for a new session. Read this instead of exploring the codebase;
open individual files only for the part you're changing.
*Last updated: 2026-09-24 (moved to TypeScript + Tailwind).*

## What it is

A multiplayer typing race for a web class: everyone types the same passage,
and your mount runs down a track as fast as you type. Monkeytype rules with a
Final Fantasy skin. Plays over LAN at a class demo.

## Stack and commands

Next.js 16 (App Router, **TypeScript strict**) · React 19 · Socket.IO ·
Bun 1.4 · PostgreSQL 17 · Tailwind CSS v4.

```bash
bun run dev      # ALWAYS this, never `next dev` — server.ts runs Next + Socket.IO together
bun run lint
bun run typecheck   # tsc --noEmit (TypeScript is pinned to 6.0: TS 7 has no JS API, which Next and typescript-eslint need)
bun run build
bun scripts/admin.ts list
```

PostgreSQL runs via Homebrew (`brew services start postgresql@17`), database
`chocobo_race`, connection string in `.env` (git-ignored). Tables are created
at boot by `server/db.ts`; there is no migration step.

## Layout

| Path | What it is |
| --- | --- |
| `server.ts` | Boots Next + Socket.IO on one port; attaches the session to each socket |
| `server/rooms.ts` | **The referee.** Rooms, roles, countdown, positions, finish order, anti-cheat, mount unlock check |
| `server/api.ts` | JSON API for `/api/*`, answered before Next sees the request |
| `server/auth.ts` `server/db.ts` `server/stats.ts` `server/texts.ts` | Accounts/sessions, Postgres schema, race recording, passages |
| `lib/types.ts` | Shared types: room/player shapes and the typed Socket.IO events, imported by server and client |
| `hooks/useTypingEngine.ts` | The typing engine: correct/wrong chars, WPM, accuracy, progress reports |
| `hooks/useRoom.ts` `lib/socket.ts` | Socket events → React state |
| `app/page.tsx` | Title screen: name, mount, host or join, practice |
| `app/room/[code]/page.tsx` | Lobby → countdown → race → results (one page, driven by `room.status`) |
| `app/practice/page.tsx` | Solo practice, deliberately socket-free |
| `app/account/page.tsx` `app/stats/page.tsx` | Sign in / create account, rider record + leaderboard |
| `components/` | UI only (Track, TypingBox, Lobby, Results, MountPicker, RoomBar, Chocobo…); `ui.tsx` holds the small shared pieces (Panel, Stat, Spec, Field, Th/Td…) |
| `lib/chocobos.ts` | Mount list: ids, labels, sprite paths, aspect ratios, `restricted` flags |
| `scripts/` | Admin CLI and SQLite→Postgres migration (TS), sprite preparation (Python) |

## Rules that must not be broken

- **The server decides everything that matters.** Clients only send "I typed N
  correct characters". Positions, finish order, WPM and time come from
  `server/rooms.ts`. Progress faster than ~300 WPM is ignored.
- **Restricted mounts are enforced server-side** in `safeColor()`. Hiding them
  in the picker is cosmetic; the colour is just a string a client sends.
- **Accuracy is reported by the browser** (only it counts keystrokes) — treat
  it as self-reported.
- **One host per room.** The host opens the room, presses start and spectates;
  they never type. Only ready riders join a race (`player.racing` snapshot).
  If the host drops, the seat is held 20s for a reconnect, then the
  longest-present player inherits it.
- **Practice must stay unrecorded.** `/practice` opens no socket and joins no
  room; it only fetches `GET /api/text`. Results are written solely when a
  race ends, so there is no path from practice to the database.
- **Results are saved for signed-in finishers only.** Guests race normally.

## Data model (PostgreSQL)

`users` (username case-insensitive via a `lower(username)` unique index,
argon2id hash, `is_admin`) · `sessions` (random token, expiry) · `unlocks`
(account → mount) · `races` (one row per finished race: wpm, accuracy,
time_ms, place, riders).

## Interfaces

Socket: `joinRoom` `toggleReady` `startRace`(host) `progress` `stats`
`playAgain`(host) `leaveRoom` → `roomUpdate` `positions`.

HTTP: `POST /api/auth/{signup,login,logout}` · `GET /api/auth/me` ·
`GET /api/text` · `GET /api/stats/me` · `GET /api/stats/leaderboard` ·
`POST /api/admin/mount`.

## Mounts

Free: yellow, red, blue, green, black, gold (recoloured chocobos) plus any
custom `#rrggbb` (recoloured in the browser on a canvas).
Unlockable: `fox` `miku` `berry` `joker` `piper` `boba` `invader` `kirby`
`tarnished` — in-jokes, granted per account.

To add one: prepare the sprite (`scripts/prepare-mount.py` if already
transparent, `remove-background.py` for a flat background,
`prepare-screenshot.py` for a screenshot, or draw it like `draw-berry.py`),
add an entry with its `aspect` to `CHOCOBO_COLORS`, add the id to both
`PRESET_COLORS` and `RESTRICTED_MOUNTS` in `server/rooms.ts`, **restart the
server**, then `bun scripts/admin.ts grant <user> <mount>`.

## Look

Retro menu-box theme from a Claude Design mockup: bordered windows over a
night-blue field, Press Start 2P for labels, IBM Plex Mono for reading, an
accent cursor `▶` on the live row. Light theme is the same layout in pale
blue under `[data-theme="light"]`; the toggle writes `localStorage` and a
pre-paint script in `app/layout.tsx` applies it. One accent variable,
`--accent` (gold dark / blue light).

Styling is Tailwind v4, configured in `app/globals.css` (no tailwind.config):
the colours stay CSS variables and `@theme inline` maps them to utilities
(`text-accent`, `border-edge/25`, `bg-ink`…), so the theme still switches at
runtime. Custom utilities: `frame` (the bordered window), `bg-window`,
`bg-bar`, `bg-sky`, `bg-field`, `bg-raised`. Variants: `light:` for
light-theme tweaks, `wide:` / `max-wide:` for the 900px breakpoint. Only
`.btn`, `.btn-primary`, `.btn-block`, `.btn-link` live in `@layer components`
(they need the `▶` pseudo-element).

## Conventions

- **Comments only for critical systems** (auth, `server/rooms.ts`, the typing
  engine, non-obvious gotchas). UI, pages, styling and helpers ship without
  them. See "Code style: comments" in the README.
- Lint forbids `setState` called straight from an effect body — read external
  things with `useSyncExternalStore`, or set state inside an async callback.
- British-ish plain prose in user-facing copy; no em-dash-free rule, just keep
  it readable.

## Gotchas that have already cost time

1. Socket.IO needs `destroyUpgrade: false`, or it kills Next's hot-reload
   socket every second and page navigation breaks in dev.
2. **Files in `server/` only load at startup** — after editing them, restart,
   or you'll debug a mount the server doesn't know about.
3. A host who reloads **mid-race** can't rejoin: joins are refused unless the
   room is in the lobby. Still unfixed.
4. The rider profile (name/mount/role) lives in `sessionStorage`, so it's
   per-tab; a fresh tab shows the in-room join card instead.
5. `eslint-disable` lines look like comments but are directives — don't strip
   them.
6. Watch for watermarked stock art in sprite sources (a diagonal repeating
   word). One had to be redrawn.

## State of the accounts

`phil` (admin, all mounts; password kept out of the repo), `BenocxX`/"Mathis"
(teacher, berry), `cityx258` (miku), `vulpes` (fox), `Chab` (someone who
joined over the LAN). `phil` and `vulpes` are test accounts — delete them
before showing this to the class: `bun scripts/admin.ts delete <username>`.

## Possible next steps

Sprite sheets for a real run cycle · a typo counter on the results screen ·
password change / reset · letting a host rejoin mid-race · deploying to
Render (set `DATABASE_URL`, `sslmode=require`).
