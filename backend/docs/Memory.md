# Memory.md — VeriTrust Backend

> **AI: read this file first in every new chat.** Update it at the end of every task.
> Keep it short. Replace stale info instead of appending forever.
> Docs: `PRD.md` (what) · `Architecture.md` (how) · `Rules.md` (constraints) · `Phases.md` (order) · `Design.md` (API contract)

---

## Current status

- **Current phase:** Phase 2 — Session setup (✅ done)
- **Last updated:** 2026-09-17
- **Next step:** Phase 3 — Task bank and question bank. Wait for "next" before starting.

## Phase tracker

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | ✅ | build + 16 tests pass; /ready verified against real Postgres + Redis |
| 1 Auth & orgs | ✅ | build + 30 tests pass; register/login/refresh/logout/me/switch-org, org + member CRUD, candidate directory, verified live against Postgres + Redis |
| 2 Session setup | ✅ | build + 44 tests pass; session-state.service CAS transitions, session CRUD + interviewers, JD upload/parse worker, config PATCH — verified live end-to-end incl. worker |
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
│   ├── integration/app.test.ts, auth.test.ts, session.test.ts   health/404/JSON/helmet, auth flows,
│   │   session CRUD + access control + state machine + config + JD upload/parse (worker called directly,
│   │   not via a running BullMQ worker — see jd-parse test)
│   └── unit/                     error handler + validate, hash utils, providers
├── src/
│   ├── index.ts                  http server, graceful shutdown, fatal handlers
│   ├── worker.ts                 BullMQ worker bootstrap (jd-parse); run with `npm run worker`
│   ├── app.ts                    requestId → pino-http → helmet → cors → json → cookies → /api/v1 (apiLimiter) → 404 → errorHandler
│   ├── config/env.ts             zod env; ONLY place that reads process.env
│   ├── config/constants.ts       JD upload caps, pagination defaults (detection.ts tunables come in Phase 6)
│   ├── controllers/health, auth, org, candidate-directory, session, jd .controller.ts
│   ├── routes/index.ts (apiRouter mounts health/auth/org/candidate-directory/session/jd), auth.routes.ts,
│   │   org.routes.ts, candidate-directory.routes.ts, session.routes.ts, jd.routes.ts (each router's own
│   │   middleware is mounted with an explicit path prefix, e.g. `router.use("/auth", authLimiter)` —
│   │   NEVER `router.use(mw)` with no path, since a sub-router mounted at apiRouter's root ("/") would
│   │   otherwise apply that middleware to every request)
│   ├── services/health, auth, org, candidate-directory, audit, session, session-state, config, jd .service.ts
│   │   (session-state.service.ts `transition()` is the ONLY place InterviewSession.status changes: CAS via
│   │   updateMany + audit log in one transaction, then publishes events:{sid} "session.state")
│   ├── middlewares/request-id, validate (+ getInput), not-found, error-handler, rate-limit, auth
│   │   (requireUser), org-role (requireRole), session-access (requireSessionAccess — org membership +
│   │   bound-interviewer-or-privileged-role check, sets req.sessionRecord), upload (jdUpload, multer memory)
│   ├── providers/index.ts        getStorage/getMail/getLlm/getMedia/getSandbox/getSigner (lazy singletons)
│   │   storage(local) mail(smtp|log) llm(mock) media(mock) sandbox(mock) signer(ed25519)
│   ├── workers/jd-parse.worker.ts  extracts text (pdf-parse v2 `new PDFParse({data}).getText()`, or
│   │   mammoth.extractRawText for DOCX, or rawText for TEXT) → llm.parseJd() → PARSED/FAILED
│   ├── utils/queues.ts           BullMQ Queue instances (jdParseQueue) + QUEUE_NAMES
│   ├── utils/events.ts           publishSessionEvent(sid, event, payload) → redis.publish("events:{sid}");
│   │   no subscriber yet (sockets land in Phase 5) but worker/services already publish jd.parsed etc.
│   ├── types/express.d.ts        req.requestId, req.input, req.user, req.sessionRecord
│   ├── types/parsed-jd.ts        zod ParsedJD schema
│   └── utils/prisma, redis, logger, app-error, respond, ids, hash, jwt
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

express 5 · zod 4 · prisma/@prisma/client/@prisma/adapter-pg 7.10 · ioredis 6 · pino 10 · pino-http 11 · express-rate-limit 8 · rate-limit-redis 6 · helmet 8 · nodemailer 10 · ulid 3 · dotenv 17 · typescript 7 · tsx 4 · vitest 5 · supertest 7 · argon2 (latest) · jose (latest) · bullmq (latest) · multer (latest) · pdf-parse 2.4.5 (class-based `PDFParse` API, not the old callback/promise-of-buffer style) · mammoth (latest)

Removed: `bcryptjs`, `jsonwebtoken` (Rules: use `argon2`, `jose`).

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
| 2026-09-17 | Added `familyId` to `RefreshToken` (migration `refresh_token_family`) | Schema had no way to scope rotation-family revocation to one login session; asked user, chose proper family tracking over revoking all of a user's sessions on reuse |
| 2026-09-17 | Login/refresh pick the org from the membership with the oldest `createdAt` as the active org | Design.md doesn't specify tie-break; there's no "last used org" field yet. Revisit if a user needs a specific default org |
| 2026-09-17 | `/auth/*` rate limiter uses limit 1000 (not 10) when `NODE_ENV=test` | The Design.md 10/min limit is real for prod; integration tests share one in-memory limiter instance per test file and register many users, which tripped 429s unrelated to the behaviour under test |
| 2026-09-17 | `vitest.config.ts` sets `fileParallelism: false` | All integration tests share one real Postgres/Redis and each truncates tables in `beforeEach`; running test files in parallel raced those resets (flaky 409/undefined failures). Sequential files trade a little speed for determinism |
| 2026-09-17 | JD upload accepts a session in any status but validated by `assertSessionEditable` (org-scoped existence only, no status gate) | Phases.md doesn't restrict which session statuses allow a JD upload; config PATCH is the one gated by status. Revisit if a later phase wants JD locked once LIVE |
| 2026-09-17 | `config.service.patchConfig` increments `configVersion` on any field change except a `taskIds`-only patch | Design.md ties `configVersion++` to "channel added after consent"; extended it to all effective config changes so `configVersion` is a real change counter, not just a reconsent flag. `needsReconsent` itself only flips on the documented channel-addition-after-consent case |
| 2026-09-17 | `pdf-parse@2.4.5` uses `new PDFParse({ data: buffer }).getText()` then `.destroy()`, not the old `pdf-parse(buffer)` promise API | The installed major version changed its API to a class; worth knowing before Phase 6/9 touch JD or evidence PDF handling again |

---

## Environment notes

- Machine: macOS arm64, Node v25.6.1 (package `engines` says >=22; switch to LTS if odd issues appear)
- Run everything from `backend/`. Prisma via local `npx prisma` only (never `@latest`). Never `npm audit fix --force`.
- Local services: `docker compose up -d` (or native Postgres/Redis on default ports)

## Known issues / open questions

- Schema has no `mediaReadyAt`; using Redis instead (revisit if needed for audit).
- `mockSandbox` does not run code; `mockLlm` is keyword-based. Both intentional until later phases.
- No "last active org" persistence: login/`/auth/me` always resolve to the oldest membership. Fine while
  users typically belong to one org; revisit if multi-org UX needs a sticky default.
- Org member endpoints require the target user to already exist (`addMember` looks up by email and 404s
  otherwise) — there's no invite-by-email-that-creates-a-user flow yet; not specified in Phases.md Phase 1.
- `PATCH /sessions/:id/config` `taskIds` validates the tasks belong to the org (`coding_tasks.orgId`), but
  there's no `/coding-tasks` CRUD yet (Phase 3) — untestable end-to-end until then.
- JD parsing needs a running `npm run worker` process (BullMQ) to actually flip PENDING → PARSED/FAILED in
  a real deployment; tests call `processJdParse()` directly instead of running the worker.
- `session.service.listSessions` paginates by `id desc` (ulid, so this is creation order) and filters
  `scheduledAt` by `from`/`to`; a DIRECT_LINK session with no `scheduledAt` is excluded by any from/to
  filter. Fine for now — revisit if DIRECT_LINK sessions need date filtering by `createdAt` instead.

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

### 2026-09-17 — Phase 2 session setup
- Phase: 2
- Built: `session-state.service.ts` (`transition()` CAS + audit, the only writer of
  `InterviewSession.status`); session CRUD (`session.service.ts` — create with primary interviewer,
  list with status/date/cursor filters, get, update basic fields gated to DRAFT/CONFIGURED/ARMED, cancel
  → ABORTED, add/remove interviewers with primary protection); `middlewares/session-access.ts`
  (`requireSessionAccess`); JD upload/parse (`jd.service.ts`, `middlewares/upload.ts` multer memory
  storage + magic-byte check for PDF/DOCX, `utils/queues.ts` BullMQ `jd-parse` queue,
  `workers/jd-parse.worker.ts` extracting text via `pdf-parse`/`mammoth`/raw text then
  `llm.parseJd()`, `src/worker.ts` bootstrap); `config.service.ts` (`PATCH /sessions/:id/config`,
  validates `taskIds` against the org's coding tasks, DRAFT→CONFIGURED, `needsReconsent` +
  `configVersion` bump); `utils/events.ts` (`publishSessionEvent`, Redis pub/sub for later phases)
- Files: `src/services/{session,session-state,config,jd}.service.ts`,
  `src/controllers/{session,jd}.controller.ts`, `src/routes/{session,jd}.routes.ts`,
  `src/validators/{session,config,jd}.schema.ts`, `src/middlewares/{session-access,upload}.ts`,
  `src/workers/jd-parse.worker.ts`, `src/worker.ts`, `src/utils/{queues,events}.ts`,
  `src/config/constants.ts`, `src/types/express.d.ts` (added `req.sessionRecord`)
- Schema/migrations: none
- New env vars: none
- Tests: 44 passing total (14 new in `tests/integration/session.test.ts`) — session-state allowed/forbidden
  transitions incl. cross-org 404, session CRUD, org-isolation and bound-interviewer access control,
  edit-blocked-once-LIVE, cancel, primary-interviewer removal guard, config PATCH incl. task-ownership
  validation and needsReconsent-after-consent, JD text upload → worker parse → PARSED, invalid ParsedJD
  PATCH rejected. `npm run typecheck` and `npm run build` clean. Also fixed `vitest.config.ts`
  (`fileParallelism: false`) since integration tests share one real Postgres/Redis.
- Decisions: see Decisions log (fileParallelism, configVersion semantics, pdf-parse v2 API, JD status gate)
- Issues left: see Known issues
- Next: Phase 3 — task bank and question bank. Wait for "next".

### 2026-09-17 — Phase 1 auth and organisations
- Phase: 1
- Built: register/login/refresh/logout/me/switch-org (`services/auth.service.ts`, `controllers/auth.controller.ts`,
  `routes/auth.routes.ts`, `validators/auth.schema.ts`); `middlewares/auth.ts` (`requireUser`) and
  `middlewares/org-role.ts` (`requireRole`); org endpoints + member CRUD with last-owner protection
  (`services/org.service.ts`); candidate directory list/create/get (`services/candidate-directory.service.ts`);
  `services/audit.service.ts` `log()`, called on register/login/member changes; `utils/jwt.ts` (access token
  sign/verify with `jose`); rate limiter on `/auth/*`
- Files: `src/{services,controllers,routes,validators}/{auth,org,candidate-directory}.*`,
  `src/services/audit.service.ts`, `src/middlewares/{auth,org-role}.ts`, `src/utils/jwt.ts`,
  `src/types/express.d.ts` (added `req.user`), `src/config/env.ts` (added `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_TTL_DAYS`), `scripts/generate-signing-key.ts` (now also prints `JWT_ACCESS_SECRET`)
- Schema/migrations: `20260917131134_refresh_token_family` — added `RefreshToken.familyId`
- New env vars: `JWT_ACCESS_SECRET` (required, ≥32 chars), `JWT_REFRESH_TTL_DAYS` (default 30)
- Tests: 30 passing (`tests/integration/auth.test.ts`, 24 new) — register/duplicate-email/weak-password,
  login/wrong-password/unknown-email, `/auth/me` auth guard, refresh rotation, reuse revokes the family,
  logout revokes the cookie, role guard (INTERVIEWER blocked from `/org/members`), org isolation (org A
  can't read org B's candidate → 404), last-owner protection (409 `LAST_OWNER`); `npm run typecheck` and
  `npm run build` clean
- Decisions: see Decisions log (`familyId` migration, active-org tie-break, test rate-limit override)
- Issues left: see Known issues
- Next: Phase 2 — session setup (JD upload/parse, session CRUD, config). Wait for "next".

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
