# 🐤 Chocobo Race

A multiplayer typing race (like Monkeytype) where every rider is a chocobo
running down a track. Type fast, run fast.

Each room has **one host and up to forty riders** (a race needs at least two). The host opens the room,
starts the race and watches it from the stands — hosts never type. Riders
ready up and race. If the host's browser drops (a refresh, a flaky network)
the seat is held open for 20 seconds so they can reclaim it; only if they
don't come back does the longest-present player inherit it.

Accounts are optional: guests can race as always, and signing in saves your
results and unlocks any special mounts granted to you.

Built with Next.js (React) in TypeScript, Tailwind CSS, Socket.IO, Bun and PostgreSQL.

New to the codebase? `PROJECT-SUMMARY.md` is the short orientation: the
architecture, the rules the server enforces, and the gotchas — quicker than
reading the source.

## Run it

```bash
bun install
createdb chocobo_race          # needs PostgreSQL running
cp .env.example .env           # then point DATABASE_URL at it
bun run dev
```

On a Mac, PostgreSQL comes from Homebrew:

```bash
brew install postgresql@17 && brew services start postgresql@17
```

Open http://localhost:3000. To test multiplayer on your own, open a second
browser tab and join with the room code (each tab is its own player).

> Always use `bun run dev`, not `next dev`: the game needs the custom server
> in `server.ts`, which runs Next.js and Socket.IO together.

## Code style: comments

**Don't comment code that explains itself.** Names and structure carry the
meaning; a comment that restates the line below it is noise that goes stale.

Comments are for **critical and fundamental systems only** — the places where
getting it wrong is expensive and the reason isn't visible in the code:

- **Security and accounts** — `server/auth.ts` (why passwords are hashed the
  way they are, why a missing account still runs a hash), session handling.
- **Core game rules** — `server/rooms.ts`: the anti-cheat limit, the host
  reclaim window, why restricted mounts are checked on the server.
- **The typing engine** — `hooks/useTypingEngine.ts`: what it reports and when.
- **Non-obvious gotchas that would otherwise be re-broken** — e.g. Socket.IO's
  `destroyUpgrade: false` in `server.ts`, or the pre-paint theme script in
  `app/layout.tsx`.

Everything else — components, pages, styling, helpers — ships without
comments. If a piece of UI code needs a comment to be understood, rename
things or split the function instead.

## How it works

- **The server is the referee** (`server/rooms.ts`): it keeps every room in
  memory, picks the text, runs the countdown, collects each player's progress,
  broadcasts positions ~10×/second, and decides the finish order and WPM.
- **Clients only type and draw.** The browser works out what you typed
  locally (instant feedback), sends "I've typed N correct characters" to the
  server, and draws the track from what the server sends back.

| File | What it does |
| --- | --- |
| `server.ts` | Starts Next.js + Socket.IO on one port |
| `server/rooms.ts` | Rooms, ready-up, countdown, race, finish, anti-cheat |
| `server/texts.ts` | Picks the text to type from the PostgreSQL bank (passages or random dictionary words) |
| `hooks/useRoom.ts` | Socket events → React state |
| `hooks/useTypingEngine.ts` | The typing logic: correct/wrong chars, WPM, accuracy, progress reports |
| `components/RaceScreen.tsx` | Countdown, track, header stats and prompt during a race |
| `components/TypingBox.tsx` | Renders the text Monkeytype-style |
| `components/Track.tsx` | The race track and lanes |
| `components/SpectatorScreen.tsx` | The host's view of a race: track and clock, no typing box |
| `app/page.tsx` | Home: name, colour, host a race or join as a rider |
| `app/room/[code]/page.tsx` | Lobby → countdown → race → results |
| `app/practice/page.tsx` | Solo practice: same typing engine, no socket, nothing saved |

### Practice mode

`/practice` is a solo run for warming up. It uses the same typing engine and
the same track, but it never opens a socket and never joins a room — the only
thing it asks the server for is a passage (`GET /api/text`). Since results are
only written when a *race* ends in `server/rooms.ts`, there is no code path
that could record a practice run.

### Accounts, stats and the database

Everything that has to survive a restart lives in **PostgreSQL**. Bun talks
to Postgres natively (`Bun.SQL`), so there's still no database driver to
install. The connection string is `DATABASE_URL` in `.env` (git-ignored);
`server/db.ts` creates any missing tables at boot, so there's no migration
step to remember.

Queries are tagged templates — `` sql`... ${value}` `` sends the value as a
parameter, so user input can never be read as SQL.

| Table | Holds |
| --- | --- |
| `users` | username, rider name, password hash, admin flag |
| `sessions` | random session tokens and when they expire |
| `unlocks` | which accounts may use a restricted mount (fox, miku, joker…) |
| `races` | one row per finished race: WPM, accuracy, time, place, field size |

- **Passwords are never stored.** `Bun.password.hash` (argon2id, random salt
  per password) hashes them; signing in re-hashes the attempt and compares.
  A login attempt for a username that doesn't exist still runs a hash, so a
  missing account and a wrong password take the same time to answer.
- **The session is an HttpOnly cookie** holding a random token, so page
  JavaScript can't read it. The server looks the token up in `sessions`.
- **The socket reuses that cookie** (`io.use` in `server.ts`), which is how a
  race result gets attached to an account and how unlocked mounts are checked.
- **Results are saved when a race ends**, for signed-in finishers only.

API (served by `server/api.ts`, before Next.js sees the request):
`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
`GET /api/auth/me`, `GET /api/stats/me`, `GET /api/stats/leaderboard`,
`POST /api/admin/mount`.

The project started on SQLite; `scripts/migrate-sqlite-to-postgres.ts` copies
an old `data/chocobo.sqlite` across (password hashes included, so existing
passwords keep working) and is safe to re-run.

### Admin

Nobody can make themselves an admin, so the first one is made from the
terminal:

```bash
bun scripts/admin.ts make-admin <username>
bun scripts/admin.ts grant <username> fox
bun scripts/admin.ts list
```

The texts to type live in the database, seeded from `server/seed/` the first
time the server starts. To manage them:

```bash
bun scripts/admin.ts texts            # list passages and counts
bun scripts/admin.ts add-text fr "Un nouveau passage à taper, assez long pour une course."
bun scripts/admin.ts delete-text 7
```

### Socket events

| Event | Direction | Payload |
| --- | --- | --- |
| `joinRoom` | client → server | `{ code, name, color }` |
| `toggleReady` | client → server | – (riders only) |
| `updateSettings` | client → server | `{ language?, kind? }` (host only, lobby only; broadcast to the room) |
| `startRace` | client → server | – (host only; ready riders take part) |
| `progress` | client → server | number of correct characters typed |
| `stats` | client → server | `{ accuracy }`, reported at the finish line |
| `playAgain` | client → server | – (host only: back to the lobby) |
| `leaveRoom` | client → server | – |
| `roomUpdate` | server → room | full room: status, text, players |
| `positions` | server → room | `[{ id, progress }]` during a race |

## Design

The look comes from a Claude Design mockup ("Featherfall"), retro menu-box
direction: a deep night-blue field, every panel a bordered window (3px light
border over a hard `0 0 0 3px` shadow), Press Start 2P for headings and
labels, IBM Plex Mono for anything you actually read, gold `▶` cursors on the
live row, and status words (READY / EATING / WAIT) instead of badges. The
race prompt is a battle-dialogue box; results open with a RACE COMPLETE
banner. All of it lives in `app/globals.css` as CSS variables — `--window`,
`--edge`, `--gold`, `--sky`, `--field`. The game's name is `SITE_NAME` in
`components/Wordmark.tsx` (its second word goes gold, like FEATHER/FALL).

**Both themes.** The dark palette is the default `:root`; the light one is the
same layout in pale blue under `[data-theme="light"]` — navy borders, a royal
blue cursor, blue windows, so it still reads as an old menu screen rather than
a different game. The accent colour is one variable, `--accent` (gold in the
dark theme, blue in the light one). The switch in
the top bar (`components/ThemeToggle.tsx`) flips `data-theme` on `<html>` and
remembers the choice in `localStorage`. A tiny inline script in
`app/layout.tsx` applies it *before the first paint*, so there's no flash of
the wrong theme; the first visit follows the system setting. Adding a colour
means adding it to both palettes and nothing else.

The bird is a pixel-art sprite. `public/chocobo.png` is the cleaned original —
`scripts/prepare-sprite.py` makes it from the source JPEG by flooding the
checkerboard background away from the edges inwards (so the bird's own white
pixels survive) and snapping every pixel to the sprite's ten real colours.
`public/chocobo-<colour>.png` are the six rider colours, generated from it by
`scripts/recolor-sprites.py`. That script swaps only the
four feather colours, so every bird keeps the same eye, beak and feet — a CSS
filter would have twisted those too. To change or add a colour, edit
`VARIANTS` in the script, run `python3 scripts/recolor-sprites.py`, and add the
id to `CHOCOBO_COLORS` in `lib/chocobos.ts`.

Riders can also mix their own colour. A custom colour travels as `#rrggbb`,
and each browser recolours the sprite on a canvas with the same palette swap
(`lib/recolorSprite.ts` + `lib/chocoboPalette.ts`), caching the result. The
server only stores the string, and rejects anything that isn't a preset id or
a hex colour.

Besides the chocobos there's a **white fox** mount (`public/fox-white.png`),
prepared from downloaded pixel art by `scripts/prepare-fox.py` — the source was
cropped mid-leg, so the script trims the empty canvas and finishes the paws.
It's long and low rather than square, so `lib/chocobos.ts` gives it its own
`aspect`, and `pale: true` draws a thin outline so a white animal still reads
on the cream panels. Art credit: fox sprite by **isalealart** — keep the credit
if you show this anywhere.

There are also **unlockable mounts**, one per teacher/friend in-joke: the
white fox, Miku, the blueberry, Joker, the Pied Piper, Boba Fett, the Invader,
Chef Kirby and the Tarnished. Each is a sprite in `public/` plus an entry with
`restricted: true` in `lib/chocobos.ts`. They're marked `restricted: true` in
`lib/chocobos.ts`, which hides them from the picker, and listed in
`RESTRICTED_MOUNTS` in `server/rooms.ts`, which is the check that counts: the
mount is just a string a client sends, so `safeColor()` swaps anything
unauthorised back to yellow. Grant one with
`bun scripts/admin.ts grant <username> <mount>`.

Four scripts prepare sprites, depending on what you start with:
`prepare-mount.py` (already transparent — just trims), `remove-background.py`
(flat background to cut out), `prepare-screenshot.py` (a screenshot: trims
page margins, resamples away the upscaling blur, reduces to a flat palette,
then cuts the background) and `draw-berry.py` (hand-drawn from a grid).

To add another: drop the sprite in `public/`, run the matching script, add an
entry (with its `aspect`) to `CHOCOBO_COLORS`, and add the id to both
`PRESET_COLORS` and `RESTRICTED_MOUNTS`. Restart the server — `server/` files
only load at startup.

It's a single frame, so the running look comes from the `hop` animation. Swap
in a sprite sheet later and animate it with CSS `steps()` in
`components/Chocobo.tsx`.

## Deploy

Vercel can't host this (no long-lived WebSocket connections). Use **Render**
or **Railway**:

- Build command: `bun install && bun run build`
- Start command: `bun run start`
