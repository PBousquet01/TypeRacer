# CLAUDE.md

Instructions for AI coding agents (Claude Code) working on Chocobo Race, a
multiplayer typing race built for the *Web V — Travail de session* course.
The student who owns this repo is responsible for every line in it: work in
small, explainable steps.

## Start here

- **Read `PROJECT-SUMMARY.md` first.** It describes the stack, architecture,
  invariants, data model and known gotchas. Don't re-explore the codebase to
  rebuild that picture; open only the files for the part you change.
- The graded spec is the teacher's PDF (IDs like `TECH-01`, `SALLE-06`,
  `COURSE-10`). `docs/EXIGENCES.md` tracks every requirement against it.
- Where an older document (the first cahier des charges, IDs like `TXT-9`)
  disagrees with the PDF, the PDF wins.

## Commands

```bash
docker compose up -d   # local PostgreSQL on 127.0.0.1:5434
bun run dev            # ALWAYS this, never `next dev` (server.ts runs Next + Socket.IO)
bun run lint
bun run typecheck      # tsc --noEmit
bun test               # unit + server tests, against the real database
bun run test:e2e       # Playwright end-to-end tests
bun run db:generate    # after changing server/schema.ts
```

Files in `server/` only load at startup: restart the dev server after
editing them.

## Rules that must not be broken

- **TypeScript only, strict.** No `.js` files, no `any`, no `@ts-ignore`.
- **The server decides everything that matters** (positions, finish order,
  results, bonuses, host-only actions). Clients send the keys they pressed,
  never a verdict.
- **Every server input goes through a Zod schema** (`server/schemas.ts`):
  socket payloads, JSON bodies, query strings. New event or route? Schema
  first.
- **Never edit the database or a committed migration by hand.** Change
  `server/schema.ts`, run `bun run db:generate`, commit the new migration.
- **No secrets in the repo.** `.env` is ignored; document new variables in
  `.env.example`. The only exception, approved by the owner: the demo
  account's password in the README (the spec requires it).
- **Every interface string lives in `lib/i18n/en.ts` and `lib/i18n/fr.ts`.**
  The server sends codes, never sentences.
- **The site's name and logo come from the student, never from an AI**
  (DES-01, DES-02). Don't suggest names or draw logos.
- **Check the official docs before stating what a provider or library can
  or can't do** (hosting limits, free tiers, APIs). Don't answer from memory.

## Conventions

- **Comments only in critical systems** (auth, `server/rooms.ts`, the typing
  engine, non-obvious gotchas). UI code ships without them. See "Code style:
  comments" in the README.
- Code and comments in English; the documentation for the teacher (`docs/`)
  in French.
- Elements the end-to-end tests use carry a `data-testid`. E2E files end in
  `.e2e.ts` (not `.spec.ts`, or `bun test` would run them).
- Playwright is pinned to 1.63.0 to match the Chromium already installed.

## Workflow

1. One requirement (or a small group) at a time.
2. Verify by running it: tests, and the browser for anything visible. Don't
   over-test: stop when a check is clearly redundant.
3. **Update `docs/EXIGENCES.md` in the same change**: status, files, tests,
   notes, and the summary counts. Never mark a requirement complete when it
   isn't: the teacher penalises a false "complet" more than an honest
   "partiel". Update `docs/ARCHITECTURE.md` and `PROJECT-SUMMARY.md` when
   behaviour they describe changes.
4. Commit only when the owner asks ("commit", "commit and push"), one commit
   per requirement, message starting with the IDs
   (`SALLE-05, CONF-11: the host sets the room's capacity`).
5. After a push, report the commit and stop: CI and Render take minutes; the
   owner checks them or asks for a check.

## Before changing behaviour

The "☑ accepté" rows of `docs/EXIGENCES.md` are partial requirements whose
gap the teacher accepted as it is (November 2026). Don't "fix" them to match the PDF without the owner asking.
