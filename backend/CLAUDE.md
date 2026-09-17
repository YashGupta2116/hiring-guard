# CLAUDE.md — VeriTrust Backend

You are working in `backend/` of VeriTrust, an interview integrity platform.
Express 5 + TypeScript (ESM) + Prisma 7 + PostgreSQL + Redis. No ML work. Frontend is out of scope.

## Start of every session (mandatory)

1. Read `docs/Memory.md` — current phase, what exists, conventions, decisions.
2. Read `docs/Rules.md` — hard constraints. Follow them over your own preferences.
3. Read the current phase in `docs/Phases.md`.
4. Look up exact names in `prisma/schema.prisma` and `docs/Design.md` (endpoints, payloads, events, error codes).
   Use `docs/Architecture.md` for folder layout and flows, `docs/PRD.md` for requirement IDs.

Do not re-read the whole codebase. `docs/Memory.md` tells you where things are.

## Environment check (only if Memory.md says setup is not verified)

Run from `backend/`, fix anything that fails, then record the result in Memory.md:

```bash
npm install
grep -q "^HASH_PEPPER=." .env || echo "run: npm run keys:generate and put its 3 lines in .env"
docker compose up -d            # ask before starting if Docker is not running
npm run db:migrate -- --name init   # only if prisma/migrations is empty
npm run typecheck && npm test
```

## How to work

- Work on **one phase at a time**, in order. Complete every checklist item of the current phase.
- Before coding a phase, write a short plan (files to create/change) and then implement it.
- Follow the conventions already in the code: `validate()` + `getInput()`, `AppError`, `respond.ts` helpers,
  `createRateLimiter()`, providers via `providers/index.ts`, named exports, `.js` import extensions.
- When a phase is done:
  1. `npm run typecheck` and `npm test` must pass (add tests listed in the phase).
  2. Update `docs/Memory.md` (status, file map, decisions, env vars, known issues, next step).
  3. Commit: `git add -A && git commit -m "phase N: <summary>"`.
  4. **Stop and report**: what was built, how to test it manually (curl examples), anything I must do.
  Wait for me to say "next" before starting the next phase.

## Ask me before

- Changing `prisma/schema.prisma` (then create a named migration).
- Adding a dependency not listed in `docs/Rules.md`.
- Changing constants in `src/config/detection.ts` or `src/config/constants.ts`, the state machine, or the scoring formula.
- Deleting files you did not create in this session.
- Anything the docs do not cover or where two docs disagree.

## Never

- `npx prisma@latest`, upgrading to Prisma 8, or `npm audit fix --force`.
- `process.env` outside `src/config/env.ts`.
- Send scores, flags, thresholds, hidden test output or report data to candidate endpoints or the `/candidate` socket.
- Delete flags or update append-only tables (observations, consents, flag_adjudications, audit_logs).
- Change session status except through `session-state.service.ts`.
- Commit `.env` or secrets.

## Commands

```bash
npm run dev            # API on :9000  (GET /api/v1/ready)
npm run typecheck
npm test
npm run db:migrate -- --name <change>
npm run db:studio
npm run keys:generate
```
