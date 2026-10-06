# Chocobo Race — project summary

Orientation for a new session. Read this instead of exploring the codebase;
open individual files only for the part you're changing.
*Last updated: 2026-10-02 (docs follow the teacher's PDF: ARCHITECTURE.md, EXIGENCES.md).*

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
bun test            # 121 tests (~65 s: several real races): typing engine, rules, referee over real sockets, API (needs Postgres)
bun run typecheck   # tsc --noEmit (TypeScript is pinned to 6.0: TS 7 has no JS API, which Next and typescript-eslint need)
bun run build
bun scripts/admin.ts list
```

Local PostgreSQL runs in Docker: `docker compose up -d` (`compose.yaml`,
postgres:17 on **127.0.0.1:5434**, user/password/db `chocobo`/`chocobo`/
`chocobo_race`, data in the `pgdata` volume). `.env` points there since
2026-10-03; the old Homebrew Postgres on 5433 still has the pre-Docker copy
(`.env.bak-before-docker`). Port 5434 because 5432 is hacksorel-2's Docker
Postgres and 5433 Homebrew's. `docker exec -it testingaiweb-db-1 psql -U
chocobo -d chocobo_race` for a shell. The schema is
`server/schema.ts` (Drizzle); migrations live in `drizzle/` and run at boot
(`migrate()` in `server/db.ts`). **Never edit the database or a committed
migration by hand**: change `schema.ts`, run `bun run db:generate`, commit
the new file. Databases from before Drizzle are adopted at the baseline
(`adoptLegacyDatabase`). `bun run db:seed` adds 3 demo accounts + history.
All queries go through `db` (Drizzle); `sql` is the raw Bun.SQL client under
it, used only by `adoptLegacyDatabase`, `.end()` and test cleanup. Drizzle
leaves column names unqualified in single-table selects, so a raw subquery
that compares two tables' columns silently compares the wrong ones: use a
join instead.

## Layout

| Path | What it is |
| --- | --- |
| `server.ts` | Boots Next + Socket.IO on one port; attaches the session to each socket |
| `server/rooms.ts` | **The referee.** Rooms, roles, countdown, positions, finish order, anti-cheat, mount unlock check |
| `server/api.ts` | JSON API for `/api/*`, answered before Next sees the request |
| `server/auth.ts` `server/db.ts` `server/stats.ts` `server/texts.ts` | Accounts/sessions, Postgres schema, race recording, text bank (`pickText` queries PostgreSQL) |
| `lib/types.ts` | Shared types: room/player shapes and the typed Socket.IO events, imported by server and client |
| `lib/typing.ts` | The typing engine's rules as pure functions (`applyInput`, `shouldReport`, accuracy, WPM); unit-tested |
| `lib/bots.ts` | The bots' typing: `planBot` turns a seed, a text and a level into timed keys; pure and unit-tested (`tests/bots.test.ts`) |
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

- **The server decides everything that matters.** Clients only send the keys
  they pressed (`typed(base, keys)`), never a verdict. `server/rooms.ts`
  replays them through the same rules as the browser (`replayKeys` in
  `lib/typing.ts`) against its own copy of the text; positions, accuracy,
  finish order, WPM and time come from that. Progress faster than ~300 WPM
  is ignored. This exists because a friend patched the page's `applyInput`
  so every key counted as right, and the server believed the count.
  What it can't stop: a script that sends the *right* keys (a bot), which
  only the speed limit bounds.
- **Room codes come from the server (SALLE-02).** A host gets one from
  `POST /api/rooms` (`reserveRoomCode`, held 5 min), then opens the room by
  joining it; `joinRoom` refuses to create a room on any other code.
  **Only signed-in users open rooms (AUTH-03, SALLE-01):** the API answers
  guests 401 `sign-in-to-host`, the code is reserved for that account, and
  `joinRoom` only creates the room for it. A guest can still inherit the host
  seat. In tests, host clients sign in as a throwaway account made by
  `startGameServer` (`auth.signedIn`; `{ guest: true }` for a guest host) and
  `freshCode()` reserves for it; it's deleted, with its races, on close.
  `PublicPlayer.avatarUrl` carries a signed-in rider's photo; the lobby shows
  it, or `Avatar`'s generated initials for guests and bots. Codes are
  6 characters from `ROOM_CODE_CHARS` in `lib/rules.ts` (no 0/O, 1/I/L).
  The join field cleans what's typed (`normalizeRoomCode`) and caps the
  *cleaned* length: a `maxLength` on the raw input would cut off a pasted
  `ABC-DEF`.
- **Visibility and invites (SALLE-03/04, JOIN-02/03).** `settings.visibility`
  is public / code (default) / private. Public rooms go to the explorer
  (`/rooms`, Socket.IO room `explorer`, `roomList` throttled to 2/s) and to
  quick play (`quickRaceRoom`: lobby or results, not full, fullest then
  oldest). Private rooms need an invite token (`?invite=` on the room URL):
  128-bit, kept in `room.invites`, bound on first use to `socket.data.ip`
  (set in `server.ts` by `clientIp`: `CF-Connecting-IP` only when
  `RENDER` is set). The host gets `inviteList`; nobody else sees tokens.
  Clipboard writes must happen right on a click (Safari), so a new link is
  created first and copied with its own button.
- **Comeback bonuses (BONUS, CONF-09, off by default).** Rules in
  `lib/bonuses.ts`; `playCheckpoints` runs after every `advance`. Each rider
  has their own `player.text` (bonuses only change its end); progress, the
  finish and WPM use it, never `room.text`. Changed texts go privately via
  `yourText`; `bonus` events announce. Bots get re-planned (`replanBot`).
- **Join throttling (SALLE-10).** `joinRoom` counts *failed* joins per
  `socket.data.ip` (`no-room`, `invite-invalid`, `invite-used`) in a sliding
  minute; at `MAX_FAILED_JOINS` (10) every join from that address gets
  `too-many-attempts`. Successful joins don't count (a class shares one IP).
  Tests that expect failures should pass their own `ip`.
- **Kicking (SALLE-07).** `kickPlayer` bans by `clientId` and account
  (`room.bannedClients`/`bannedUsers`), never by IP (a class shares one),
  revokes their invite link, removes them at once (no held lane) and emits
  `kicked`; also bans by person (`room.bannedPeople`), so a guest's new tab stays out.
- **One room per person (SALLE-06, AUTH-02).** `socket.data.person` is
  `u:<id>`, or `g:<guest id>` from the signed `chocobo_guest` cookie
  (`server/guests.ts`, HMAC with `GUEST_SECRET`; issued on the first
  Socket.IO response via `io.engine` `initial_headers`), else `s:<socket>`.
  `room_members` (PK person) is the lock: `claimRoom` before a join, released
  in `removePlayer`, emptied at boot. Another room → `in-other-room` (+`room`)
  and `RoomConflict` asks; `leaveOther` moves them (`removeElsewhere`, their
  old tab gets `removed: "other-room"`). Same person, same room → the new tab
  takes the player over (`removed: "other-tab"` to the old one, which stops
  auto-rejoining). Joins/leaves of a socket run in order (`inOrder`). Tests:
  each client is its own person (`t:<code>-<name>`) unless given `person`.
- **Results charts (RES-03, RES-05).** The referee samples each rider's net
  WPM once a second (`sampleWpm`, in the race ticker) and counts missed
  characters (`replayKeys`' `onMiss`). Both go out only once the race is
  over (`playerList`), and are saved with the race (`wpm_samples`,
  `missed_keys`). Chart colours are `--series-1..8` / `--heat-1..3` in
  `globals.css`, validated per theme; keep the fixed order.
- **History (HIST-01/02).** A race with at least one signed-in finisher
  writes one `race_runs` row (the whole field's `PublicPlayer`s, chart data
  included) and one `races` row per signed-in finisher pointing at it
  (`run_id`, `player_id`), in one transaction (`recordRace`). `/stats` pages
  through `/api/history`; `/history/[id]` reuses `<Results racedOn=…>`, and
  `/api/races/:id` only answers riders of that race. Deleting an account
  leaves its runs (other riders' history still needs them).
- **Personal records (RES-04).** `recordRace` checks each signed-in
  finisher's previous best WPM in the same transaction and returns who beat
  it (a first race doesn't count); `endRace` then sets `personalBest` and
  broadcasts again, since the database answers after the results went out.
- **Profile photos (AUTH-04, SEC-02).** `server/avatars.ts`: size limit,
  magic-byte check, sharp decode (pixel cap), 256px WebP stored in the
  `avatars` table (no disk on Render). `User.avatarUrl` is versioned
  (`?v=updatedAt`) so `/api/avatars/:id` caches for good. Oversized uploads
  are drained, not cut, so the browser gets the 413 message.
  `components/Avatar.tsx` falls back to initials.
- **Race settings (CONF-01, 04-07).** `RoomSettings` carries `maxTimeMs`
  (null = no limit) and the text options; `updateSettings` merges whatever
  Zod accepted. `lib/textgen.ts` builds the text (pure, rules at the top);
  `server/texts.ts` feeds it the language's passages and dictionary.
- **Error modes (CONF-08).** `settings.errorMode` is "correct" (default:
  held 5 chars past a mistake) or "free". Progress is `progressChars`
  (correct prefix, or everything typed in free mode); net WPM is
  `correctCount` / 5 / min. In free mode the server keeps the wrong
  characters between reports instead of trimming back to the last correct one.
- **Bots are riders without a socket** (`bot: BotLevel`, ids `bot-N`; ADR-002
  in `docs/ARCHITECTURE.md`). The host adds/removes them in the lobby. At the
  start each bot gets a plan from `planBot` (`lib/bots.ts`, pure, seeded from
  room code + race + bot id), and the race ticker (`driveBots`) feeds the
  due keys through `replayKeys` + `advance`, the same path as a person's
  `typed` keys. A race needs one person (`need-human`); the host seat never
  goes to a bot; a room with only bots left closes. Bots aren't recorded.
- **Every input goes through a Zod schema** (`server/schemas.ts`, TECH-07):
  socket payloads, JSON bodies, query strings. A schema's error messages are
  `ErrorCode`s (registered with `code()`), so `parse()` returns the precise
  code or `bad-request`. Socket acks go through `ackOf()`: a client can pass
  a non-function where Socket.IO expects the callback, and calling it would
  throw an unhandled error. New socket event or route? Add its schema first.
- **Restricted mounts are enforced server-side** in `safeColor()`. Hiding them
  in the picker is cosmetic; the colour is just a string a client sends.
- **Ranking (COURSE-10)**: every starter gets a place when the race ends
  (`rankField` in `server/rooms.ts`, after `raceStatus` sets each status):
  finishers by time, then riders the time limit stopped ("timeout") by
  progress, then those who abandoned by the progress they had. The score
  (WPM × accuracy, `scoreOf`) is still shown but no longer ranks anyone.
- **End of a race (COURSE-08, 09)**: no last call. The race ends at
  `settings.maxTimeMs` (`room.finishAt`, shown as "time left"), or once
  every starter has finished or abandoned. A rider away for `RECONNECT_MS`
  (30 s) is `abandoned` (`dropHeldLane`): kept in the field and ranked, but
  their keys are ignored; coming back shows them the spectator screen. An
  away rider still inside the hold is waited for.
- **Accuracy is counted by the server** from the keys it was sent, at the
  finish. The figure shown during the race is the browser's own estimate.
- **One host per room.** The host opens the room and presses start, then
  watches or, with `settings.hostRides` (COURSE-5), rides too and counts
  towards the minimum. `starters()` in `server/rooms.ts` decides who lines
  up: ready riders not `watching`, plus the riding host (`player.racing`
  snapshot). The host can set `watching` on a rider in the lobby
  (`setWatching`, COURSE-6); it survives across races. A riding host who
  drops keeps both the lane and the seat (held like any rider's lane).
  If the host drops, the seat is held 20s for a reconnect, then the
  longest-present player inherits it.
- **Capacity (SALLE-05, CONF-11).** `settings.capacity`, 2–30 (default 30),
  counts `participantCount`: riders (benched ones included) + bots + a riding
  host. `isFull` gates joins, `addBot` and quick play; `updateSettings`
  refuses any change that would leave more participants than the capacity
  (lowering it, or the host starting to ride), so nobody is pushed out.
- **Race rules live in `lib/rules.ts`** (shared by server and lobby): 2–30
  riders and a 30s hold on the lane of a rider who drops. The same tab (same `clientId`)
  reconnecting gets its lane and progress back; the client resumes the
  typing engine from the server's `charIndex`. Someone who joins mid-race
  is a rider with `racing: false` and watches until the next race. The state
  machine is drawn at the top of `server/rooms.ts`.
- **Practice must stay unrecorded.** `/practice` opens no socket and joins no
  room; it only fetches `GET /api/text`. Results are written solely when a
  race ends, so there is no path from practice to the database.
- **Results are saved for signed-in finishers only.** Guests race normally.

## Hosting (TECH-6)

Live at <https://chocobo-race.onrender.com> since 2026-10-02.
Render free web service (one always-on instance, so in-memory rooms work) +
Neon free Postgres. `render.yaml` is the Blueprint; `DATABASE_URL` is set in
the Render dashboard, never committed. `GET /api/health` is the health check
and must not touch the database (it would keep Neon awake). The session
cookie is `Secure` when `NODE_ENV=production`. Render redeploys on push only
when CI passes. Guide and justification: `docs/deploiement.md`.

## GitHub / Discord sign-in (AUTH-1, 2, 3)

`server/oauth.ts` holds the flow (state cookie, code → token → profile).
Keys come from `GITHUB_*` / `DISCORD_*` env vars; a provider without keys
isn't offered. The callback URL is built from `PUBLIC_URL`, else Render's
`RENDER_EXTERNAL_URL`, else `http://localhost:$PORT`, and must be registered
with the provider. Accounts are matched by the provider's **id**, never the
login. A first sign-in creates a password-less account (username from the
login, made unique); signed in, the same flow links instead. Tests fake both
providers by swapping `globalThis.fetch` in `tests/api.test.ts`.

## Class docs

The graded spec is the teacher's *Web V — Travail de session* PDF (IDs like
TECH-01, SALLE-04, CONF-08). The project's own first cahier des charges (IDs
like COURSE-3, TXT-9) still names some tests and code comments; where the two
disagree, the PDF wins.

`docs/` holds the French documentation for the teacher: `ARCHITECTURE.md`
(data model, state machine, realtime message flow, ADR-001 realtime choice,
ADR-002 planned bots), `EXIGENCES.md` (every PDF requirement: status, files,
tests, notes) and `deploiement.md`. **Keep `EXIGENCES.md` current**: when a
change moves a requirement, update its row and the summary counts in the same
commit. Never mark a requirement complete when it isn't: the teacher penalises
that more than an honest "partiel".

## Tests and CI (TECH-7)

`bun test` runs everything in `tests/`: the typing rules (`typing.test.ts`),
score and dictionaries (`rules.test.ts`), the referee with real Socket.IO
clients against a real server started in the test (`rooms.test.ts`: COURSE-3,
4, 7, 11, 14, 15, TXT-9, anti-cheat, locked mounts) and the HTTP API
(`api.test.ts`: accounts, cookies, hashing, text bank, error codes). The
database tests use `DATABASE_URL`; the API tests make a throwaway account and
delete it. Races take ~6 s because the anti-cheat forbids finishing faster
than ~300 WPM, so the suite takes ~15 s.

`.github/workflows/ci.yml` runs lint, typecheck, tests (against a
`postgres:17` service) and the build on every push to `main` and every PR.

Gotcha: all test files run in one process and share the `sql` connection, so
never call `sql.end()` in a test.

## Languages (UX-5)

Every word of the interface lives in `lib/i18n/en.ts` and `lib/i18n/fr.ts`.
`fr` is typed as `Dictionary` (the shape of `en`), so a missing or extra
French key is a type error. Components call `useT()` and read `t.lobby.start(n)`,
`t.errors[code]`… Plurals and word order are functions in the dictionary.

- The **server picks the first language** (`lib/i18n/server.ts`): the
  `chocobo-lang` cookie, else the browser's Accept-Language, else English. The
  root layout renders in it, so there's no flash of English.
- The FR/EN button (`LanguageToggle`, next to the theme button everywhere)
  switches live and writes the cookie.
- **The server never sends sentences**: errors and notices are codes
  (`ErrorCode`, `NoticeCode` in `lib/types.ts`), translated in the browser.
  The admin CLI prints them through `en.errors`.
- The interface language and the race text language are separate (TXT-7), but
  a new room's texts start in the host's interface language, and practice
  starts in the viewer's.
- Press Start 2P draws accented capitals (É, Ç) as small letters: a limit of
  the 8×8 font, not a bug.

## Data model (PostgreSQL)

`users` (username case-insensitive via a `lower(username)` unique index,
argon2id hash, NULL for GitHub/Discord-only accounts, `is_admin`) ·
`identities` (provider + provider id → user, one of each per user; AUTH-1/2/3) ·
`sessions` (random token, expiry) · `unlocks`
(account → mount) · `races` (one row per finished race: wpm, accuracy,
time_ms, place, riders) · `passages` (language `en`/`fr`, body) · `words`
(dictionary per language, for random-word races).

Texts are never in the code (TXT-3). `migrate()` seeds `passages` and `words`
from `server/seed/` only when a language is empty, so later edits stick.
Manage the bank with `bun scripts/admin.ts texts | add-text <en|fr> "…" |
delete-text <id>`. `GET /api/text` takes `?lang=en|fr&kind=sentences|words`.
The host picks the text language and type in the lobby's "Race settings"
(TXT-1/TXT-7). They live in `room.settings`, go to everyone in `roomUpdate`
(COURSE-11), can only change in the lobby, and feed `pickText` at start.
Practice has the same two choices.

## Interfaces

Socket: `joinRoom` `toggleReady` `updateSettings`(host) `setWatching`(host) `startRace`(host) `typed`
`playAgain`(host) `leaveRoom` → `roomUpdate` `positions`.

HTTP: `POST /api/auth/{signup,login,logout}` · `GET /api/auth/me` (+ configured providers) ·
`GET /api/auth/{github,discord}/{start,callback}` (`server/oauth.ts`; signed in = link) ·
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

**Logo** (UX-2): drawn by the project author; the untouched original is
`design/logo-original.png`. `public/logo.png` is the same drawing cut out on
a transparent background (soft halo kept) and is used by `Wordmark` (every
header) and the home hero. `app/icon.png` / `app/apple-icon.png` are the
browser-tab and home-screen icons (Next picks them up by file name).

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
3. A report (`typed`) must start where the server's count is (`base`), or it
   is ignored: behind means already counted, ahead means an earlier report
   was lost. A reloaded tab restarts from the server's `charIndex`, so the
   two stay in step. Older races in the DB have no accuracy (it used to
   arrive in a separate, late message).
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
password change / reset · deploying to
Render (set `DATABASE_URL`, `sslmode=require`).
