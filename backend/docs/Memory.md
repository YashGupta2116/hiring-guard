# Memory.md — VeriTrust Backend

> **AI: read this file first in every new chat.** Update it at the end of every task.
> Keep it short. Replace stale info instead of appending forever.
> Docs: `PRD.md` (what) · `Architecture.md` (how) · `Rules.md` (constraints) · `Phases.md` (order) · `Design.md` (API contract)

---

## Current status

- **Current phase:** Phase 1 — Auth and organisations (⬜ not started)
- **Last updated:** 2026-09-17
- **Next step:** Phase 1. Rewrite `routes/auth.routes.ts` and `controllers/auth.controller.ts` (currently empty placeholders, NOT mounted), add `services/auth.service.ts`, `validators/auth.schema.ts`, install `argon2` + `jose`.

## Phase tracker

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | ✅ | build + 16 tests pass; /ready verified against real Postgres + Redis |
| 1 Auth & orgs | ⬜ | placeholder auth files exist, not mounted |
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
backend/
├── docs/                         PRD, Architecture, Rules, Phases, Design, Memory
├── prisma/schema.prisma          36 models, 28 enums (migration `init` to run locally)
├── prisma.config.ts              Prisma 7 config (datasource url from env)
├── scripts/
│   ├── generate-signing-key.ts   npm run keys:generate → HASH_PEPPER + Ed25519 key
│   └── init-test-db.sql          creates veritrust_test in docker postgres
├── tests/
│   ├── setup.ts
│   ├── integration/app.test.ts   health, 404, malformed JSON, request id, helmet
│   └── unit/                     error handler + validate, hash utils, providers
├── src/
│   ├── index.ts                  http server, graceful shutdown, fatal handlers
│   ├── app.ts                    requestId → pino-http → helmet → cors → json → cookies → /api/v1 (apiLimiter) → 404 → errorHandler
│   ├── config/env.ts             zod env; ONLY place that reads process.env
│   ├── controllers/health.controller.ts, auth.controller.ts (placeholder)
│   ├── routes/index.ts (apiRouter), health.routes.ts, auth.routes.ts (placeholder, default export, unmounted)
│   ├── services/health.service.ts
│   ├── middlewares/request-id, validate (+ getInput), not-found, error-handler, rate-limit
│   ├── providers/index.ts        getStorage/getMail/getLlm/getMedia/getSandbox/getSigner (lazy singletons)
│   │   storage(local) mail(smtp|log) llm(mock) media(mock) sandbox(mock) signer(ed25519)
│   ├── types/express.d.ts        req.requestId, req.input
│   ├── types/parsed-jd.ts        zod ParsedJD schema
│   └── utils/prisma, redis, logger, app-error, respond, ids, hash
├── docker-compose.yml            postgres 17, redis 7, mailpit (UI :8025)
├── .env.example, .env.test.example, .gitignore, vitest.config.ts
```

## Conventions established in Phase 0 (follow these)

- Validation: `router.post(path, validate(schemas), controller)`; in controller `const { body, query, params } = getInput(req, schemas)`. Export the `schemas` object from `validators/<name>.schema.ts` and reuse it in both places. Express 5 `req.query` is read-only, so never assign to it.
- Errors: `throw new AppError("CODE", "message", details?)`. Codes and statuses live in `utils/app-error.ts` (mirror of Design.md §3).
- Responses: `ok`, `created`, `accepted`, `list`, `noContent` from `utils/respond.ts`.
- Rate limits: `createRateLimiter({ name, windowMs, limit })` — `name` must be unique per limiter. In tests the memory store is used.
- Routers: named exports (`export const healthRouter`), mounted in `routes/index.ts`.
- BigInt in JSON is serialised as string by the app-level json replacer.
- Redis clients use `lazyConnect`; BullMQ/subscribers must use `createRedisConnection()`.
- Providers are obtained only via getters in `providers/index.ts`.

## Installed versions (majors matter)

express 5 · zod 4 · prisma/@prisma/client/@prisma/adapter-pg 7.10 · ioredis 6 · pino 10 · pino-http 11 · express-rate-limit 8 · rate-limit-redis 6 · helmet 8 · nodemailer 10 · ulid 3 · dotenv 17 · typescript 7 · tsx 4 · vitest 5 · supertest 7

Removed: `bcryptjs`, `jsonwebtoken` (Rules: use `argon2`, `jose` in Phase 1).

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
| 2026-09-17 | Added `MAIL_PROVIDER=smtp\|log` env var (log provider for tests / no SMTP) | Tests and offline dev |
| 2026-09-17 | Validated input stored on `req.input`, read with `getInput(req, schemas)` | Express 5 made `req.query` read-only |
| 2026-09-17 | Fusion score `integrity = min(100, 200/(1+exp(S/σ)))`, corroboration boost `min(2.35, 1+0.45(k−1))` | Concrete formula for spec §7.2; tunables in `config/detection.ts` |

---

## Environment notes

- Machine: macOS arm64, Node v25.6.1 (package `engines` says >=22; switch to LTS if odd issues appear)
- Run everything from `backend/`. Prisma via local `npx prisma` only (never `@latest`). Never `npm audit fix --force`.
- Local services: `docker compose up -d` (or native Postgres/Redis on default ports)

## Known issues / open questions

- Migration `init` not yet confirmed on the dev machine.
- Placeholder `auth.routes.ts` / `auth.controller.ts` use default export and empty handlers; replaced in Phase 1.
- Schema has no `mediaReadyAt`; using Redis instead (revisit if needed for audit).
- `mockSandbox` does not run code; `mockLlm` is keyword-based. Both intentional until later phases.

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

### 2026-09-17 — Phase 0 foundation
- Phase: 0
- Built: env validation, logger, Prisma/Redis clients, error envelope + codes, validate/getInput, request id, rate limiting (Redis store), health/ready, graceful shutdown, provider interfaces + mocks, signing key script, docker-compose, vitest
- Files: see "What exists right now"
- Schema/migrations: none (init still to run)
- New env vars: LOG_LEVEL, APP_URL, API_URL, CORS_ORIGINS, REDIS_URL, HASH_PEPPER, STORAGE_*, MAIL_PROVIDER, SMTP_*, MAIL_FROM, LLM/MEDIA/SANDBOX_PROVIDER, EVIDENCE_SIGNING_*
- Tests: 16 passing; tsc clean; /ready returned db ok + redis ok against real services
- Issues left: see Known issues
- Next: Phase 1 auth and orgs

### 2026-09-17 — Project docs and schema
- Phase: 0
- Built: `schema.prisma`; PRD, Architecture, Rules, Phases, Design, Memory docs
- Files: `backend/prisma/schema.prisma`, `docs/*.md`
- Schema/migrations: schema written, migration not run
- New env vars: `DATABASE_URL`
- Tests: none yet
- Issues left: see Known issues
- Next: finish Phase 0 foundation
