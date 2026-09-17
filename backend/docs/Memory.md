# Memory.md — VeriTrust Backend

> **AI: read this file first in every new chat.** Update it at the end of every task.
> Keep it short. Replace stale info instead of appending forever.
> Docs: `PRD.md` (what) · `Architecture.md` (how) · `Rules.md` (constraints) · `Phases.md` (order) · `Design.md` (API contract)

---

## Current status

- **Current phase:** Phase 0 — Foundation (🟨 in progress)
- **Last updated:** 2026-09-17
- **Next step:** finish Phase 0 checklist items below, then run `npx prisma migrate dev --name init` from `backend/`.

## Phase tracker

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | 🟨 | schema written, Prisma 7 pinned; plumbing not built yet |
| 1 Auth & orgs | ⬜ | `routes/auth.routes.ts` exists (content unknown / to review) |
| 2 Session setup | ⬜ | |
| 3 Task & question bank | ⬜ | |
| 4 Arming & join | ⬜ | |
| 5 Realtime & lifecycle | ⬜ | |
| 6 Telemetry & detectors | ⬜ | |
| 7 Fusion, flags, warden | ⬜ | |
| 8 Coding round | ⬜ | |
| 9 Seal & evidence | ⬜ | |
| 10 Pipeline & report | ⬜ | |
| 11 Retention & hardening | ⬜ | |

---

## What exists right now

```
veritrust/
├── backend/
│   ├── prisma/schema.prisma        ✅ full schema (36 models, 28 enums), validated with Prisma 7
│   ├── src/
│   │   ├── controllers/            (exists, contents not reviewed)
│   │   ├── routes/auth.routes.ts   (exists, contents not reviewed)
│   │   ├── utils/prisma.config.ts  ⚠️ misplaced — rename to utils/prisma.ts (client singleton)
│   │   └── index.ts                ⚠️ port hardcoded 9000 but logs process.env.PORT
│   ├── .env
│   ├── package.json                (not reviewed yet)
│   └── tsconfig.json               (not reviewed yet)
├── frontend/                       (Next.js, out of scope for now)
└── ml/                             (out of scope)
```

## Phase 0 checklist progress

- [x] Prisma schema (`backend/prisma/schema.prisma`)
- [x] Prisma pinned to 7.x (7.10.0) — **was accidentally installed at repo root; must live in `backend/`**
- [ ] Remove root `veritrust/schema.prisma` and root `node_modules` / `package.json` created by mistake
- [ ] `backend/prisma.config.ts` with `datasource.url = env("DATABASE_URL")`
- [ ] First migration `init`
- [ ] Verify `package.json` (`"type": "module"`) and `tsconfig.json` (NodeNext)
- [ ] docker-compose (postgres, redis, mailpit)
- [ ] env.ts, logger, AppError, error handler, validate, request-id, respond helpers
- [ ] app.ts / index.ts split, graceful shutdown, `/health`, `/ready`
- [ ] Provider interfaces + mocks
- [ ] vitest setup

---

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-09-17 | Backend is Express 5 + TypeScript (ESM, NodeNext), not Go | Time constraint |
| 2026-09-17 | Prisma **7**, not 8 | Prisma 8 replaced `migrate dev` with contract/plan/migrate workflow; v7 matches schema and tutorials |
| 2026-09-17 | Layer-based folders (`routes/`, `controllers/`, `services/`, …) | Matches existing project |
| 2026-09-17 | No ML. CV/ASR are external producers via `/api/v1/internal/*`; channels unscored until they exist | Scope |
| 2026-09-17 | AWS services replaced: BullMQ (SQS/Step Functions/EventBridge), local storage (S3), nodemailer (SES), Ed25519 env key (KMS) — all behind provider interfaces | Local-first, swappable later |
| 2026-09-17 | LLM features (JD parse, suggestions, grading) use `MockLlmProvider` | Scope; real provider later |
| 2026-09-17 | Session model named `InterviewSession`, id `ses_<ulid>` generated in app | Avoid clash with auth sessions |
| 2026-09-17 | Media-ready flag lives in Redis `s:{sid}:state`, not Postgres | Live-only state |
| 2026-09-17 | Event log compressed with gzip, not zstd | Built into Node |
| 2026-09-17 | Composite integrity modifier `M = 100` if I≥85, `100·(I−70)/15` if 70≤I<85, suppressed if I<70 | Interpretation of spec §9 "proportional deduction" |
| 2026-09-17 | Fusion score `integrity = min(100, 200/(1+exp(S/σ)))`, corroboration boost `min(2.35, 1+0.45(k−1))` | Concrete formula for spec §7.2; tunables in `config/detection.ts` |

---

## Environment notes

- Machine: macOS arm64, Node v25.6.1 (non-LTS; switch to 22/24 LTS if odd issues appear)
- Postgres: not yet confirmed running
- Always run Prisma commands from `backend/` with local `npx prisma` (never `@latest`)
- Do **not** run `npm audit fix --force`

---

## Known issues / open questions

- `src/utils/prisma.config.ts` naming conflicts with Prisma's `prisma.config.ts`; rename.
- Contents of `package.json`, `tsconfig.json`, `routes/auth.routes.ts`, `controllers/` not yet reviewed.
- Schema has no `mediaReadyAt`; using Redis instead (revisit if needed for audit).
- Schema changes so far: none after `init` (not yet run).

---

## Template for updating this file after each task

```md
### YYYY-MM-DD — <short title>
- Phase: <n>
- Built: <what>
- Files: <paths created/changed>
- Schema/migrations: <none | migration name>
- New env vars: <none | NAMES>
- Tests: <added / passing?>
- Decisions: <any, also add to Decisions log>
- Issues left: <any>
- Next: <exact next task>
```

## Task history

### 2026-09-17 — Project docs and schema
- Phase: 0
- Built: `schema.prisma`; PRD, Architecture, Rules, Phases, Design, Memory docs
- Files: `backend/prisma/schema.prisma`, `docs/*.md`
- Schema/migrations: schema written, migration not run
- New env vars: `DATABASE_URL`
- Tests: none yet
- Issues left: see Known issues
- Next: finish Phase 0 foundation
