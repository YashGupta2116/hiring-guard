# Memory.md — VeriTrust Backend

> **AI: read this file first in every new chat.** Update it at the end of every task.
> Keep it short. Replace stale info instead of appending forever.
> Docs: `PRD.md` (what) · `Architecture.md` (how) · `Rules.md` (constraints) · `Phases.md` (order) · `Design.md` (API contract)

---

## Current status

- **Current phase:** Phase 7 — Fusion, flags, warden, dashboard loop (✅ done). Session stops after each
  phase and waits for "next".
- **Last updated:** 2026-09-18
- **Next step:** Phase 8 — Coding round. Wait for "next".

## Phase tracker

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | ✅ | build + 16 tests pass; /ready verified against real Postgres + Redis |
| 1 Auth & orgs | ✅ | build + 30 tests pass; register/login/refresh/logout/me/switch-org, org + member CRUD, candidate directory, verified live against Postgres + Redis |
| 2 Session setup | ✅ | build + 44 tests pass; session-state.service CAS transitions, session CRUD + interviewers, JD upload/parse worker, config PATCH — verified live end-to-end incl. worker |
| 3 Task & question bank | ✅ | build + 49 tests pass; coding-task CRUD (hiddenTests hidden from list/non-admin), question-bank CRUD, prisma/seed.ts |
| 4 Arming & join | ✅ | build + 59 tests pass; join links (CONFIGURED→ARMED, BullMQ expiry→EXPIRED), join/preflight/policy/consent (ARMED→ADMITTED or ABORTED candidate_declined), candidate token + `/candidate/session`, `/candidate/media-ready` — verified live end-to-end |
| 5 Realtime & lifecycle | ✅ | build + 72 tests pass; Socket.IO `/interviewer` + `/candidate` namespaces, frame-buffered dashboard emitter with replay, events:{sid} Redis subscriber, SessionRuntime (lease, 1s timer, candidate presence/abandon grace), start/end/live endpoints (ADMITTED→LIVE→SEALING→PROCESSING, seal stubbed) |
| 6 Telemetry & detectors | ✅ | build + 104 tests pass; ingest (clock correction, seq/dedup/gap→unscored), 5 pure detectors + calibration baseline, evidence hash chain, internal API (observations/transcript/heartbeat), producer-health→system.degraded |
| 7 Fusion, flags, warden | ✅ | build + 139 tests pass; fusion.engine (decay/corroboration/floor/score, pure), flag-builder (threshold crossing + 15s merge), warden (tier/cooldown/cap, fixed templates), integrity.tick 2s + snapshots 10s, GET flags + POST adjudicate, notes (REST + socket), suggestions (manual refresh + accept), candidate-boundary socket test |
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
│   ├── integration/app, auth, session, coding-task, join, lifecycle, session-runtime, telemetry, live
│   │   .test.ts (telemetry.test.ts is Phase 6: candidate tel.batch → chained observations, dup seq/gap
│   │   handling, internal API observations/transcript/heartbeat, producer DEGRADED → system.degraded →
│   │   recovery; live.test.ts is Phase 7: calibration gates flag creation, threshold crossing → flag →
│   │   15s merge, warden tier progression/cooldown/cap/no-template-no-warning, warn.ack latency,
│   │   adjudicate confirm/dismiss/downgrade incl. cross-org 404 and live score recovery on dismiss, notes
│   │   REST + socket, suggestions refresh + accept, candidate-boundary scan of every `/candidate` emit
│   │   across a scripted session with a real warning)
│   └── unit/                     error handler + validate, hash utils, providers, timer, detectors,
│       calibration, producer-health, fusion-engine
├── src/
│   ├── index.ts                  http server, graceful shutdown, fatal handlers
│   ├── worker.ts                 BullMQ worker bootstrap (jd-parse); run with `npm run worker`
│   ├── app.ts                    requestId → pino-http → helmet → cors → json → cookies → /api/v1 (apiLimiter) → 404 → errorHandler
│   ├── config/env.ts             zod env; ONLY place that reads process.env
│   ├── config/constants.ts       JD upload caps, pagination defaults, Phase 6 telemetry/producer timings
│   ├── config/detection.ts       SERVER-ONLY: LLR_TABLE (type×sensitivity), CHANNEL_WEIGHTS,
│   │   CHANNEL_DECAY_SECONDS, CHANNEL_THRESHOLDS, FUSION_SIGMA, SEVERITY_BAND_*_MULTIPLIER,
│   │   corroboration/merge tunables — never sent to clients
│   ├── controllers/health, auth, org, candidate-directory, session, jd, coding-task, question-bank,
│   │   link, join, candidate, internal, flag .controller.ts
│   ├── routes/index.ts (mounts all routers), auth/org/candidate-directory/session/jd/coding-task/
│   │   question-bank/link/join/candidate/internal/flag .routes.ts (each router's own middleware is
│   │   mounted with an explicit path prefix, e.g. `router.use("/auth", authLimiter)` — NEVER
│   │   `router.use(mw)` with no path, since a sub-router mounted at apiRouter's root ("/") would
│   │   otherwise apply that middleware to every request)
│   ├── services/health, auth, org, candidate-directory, audit, session, session-state, config, jd,
│   │   coding-task, question-bank, link, join, media, candidate, evidence, internal, flag, note,
│   │   suggestion .service.ts (session-state.service.ts `transition()` is the ONLY place
│   │   InterviewSession.status changes: CAS via updateMany + audit log in one transaction, then
│   │   publishes events:{sid} "session.state"; evidence.service.ts `appendObservations()` is the ONLY
│   │   place that assigns seq/prevHash/hash; internal.service.ts is the CV/ASR/producer side of the
│   │   Phase 6 internal API; flag.service.ts does the org/role check itself for `/flags/:flagId/*`
│   │   instead of a dedicated middleware, since the URL has no session id to key off; suggestion.service.ts
│   │   only wires the manual `POST .../suggestions/refresh` trigger, see Known issues)
│   ├── middlewares/request-id, validate (+ getInput), not-found, error-handler, rate-limit, auth
│   │   (requireUser), org-role (requireRole), session-access (requireSessionAccess — org membership +
│   │   bound-interviewer-or-privileged-role check, sets req.sessionRecord), upload (jdUpload, multer
│   │   memory), join-token (requireJoinToken — signature + live DB state: revoked/consumed/expired
│   │   checked fresh on every call, no exp claim on the JWT itself), candidate-token
│   │   (requireCandidateToken — JWT has exp = duration + 2h, loads Consent by id), service-token
│   │   (requireServiceToken — constant-time compare of INTERNAL_SERVICE_TOKEN, hashed first so unequal
│   │   lengths don't short-circuit `timingSafeEqual`)
│   ├── providers/index.ts        getStorage/getMail/getLlm/getMedia/getSandbox/getSigner (lazy singletons)
│   │   storage(local) mail(smtp|log) llm(mock) media(mock) sandbox(mock) signer(ed25519)
│   ├── workers/jd-parse.worker.ts  extracts text (pdf-parse v2 `new PDFParse({data}).getText()`, or
│   │   mammoth.extractRawText for DOCX, or rawText for TEXT) → llm.parseJd() → PARSED/FAILED
│   ├── workers/link-expiry.worker.ts  delayed BullMQ job per join link; ARMED + never consented when it
│   │   fires → transition to EXPIRED
│   ├── sockets/index.ts          Socket.IO server: /interviewer ns (access JWT in handshake.auth.token,
│   │   client emits `session.join {sessionId, lastFrameSeq?}` with ack, server checks org+binding then
│   │   joins room `session:{sid}` and replays buffered frames), /candidate ns (candidate JWT, auto-joins
│   │   its session room, drives SessionRuntime.onCandidateConnected/Disconnected)
│   ├── sockets/emitter.ts        emitToInterviewers (wraps in {frameSeq,sessionId,ts,data}, appends to
│   │   Redis `s:{sid}:buf` capped at 2000, emits) + emitToCandidate (unbuffered, allow-list only) +
│   │   replayFrom(sid, afterSeq)
│   ├── sockets/event-subscriber.ts  psubscribe("events:*") → forwards worker-published events
│   │   (utils/events.ts publishSessionEvent, e.g. jd.parsed) to emitToInterviewers
│   ├── sockets/events.ts         INTERVIEWER_EVENTS (+ SYSTEM_DEGRADED, TRANSCRIPT_PARTIAL/FINAL,
│   │   INTEGRITY_TICK, FLAG_NEW, FLAG_UPDATE, WARN_ISSUED, NOTE_ADDED, QS_SUGGESTIONS) / CANDIDATE_EVENTS
│   │   (+ WARN_SHOW) name constants + session.join, clockSync, clockOffset, telemetryBatch, warnAck,
│   │   noteAdd zod schemas
│   ├── live/session-runtime.ts   one per LIVE session: Redis fusion lease (SET NX/renew), 1s timer.tick,
│   │   candidate presence + 120s abandon-grace timer, duration-limit timer, the single serialized writer
│   │   for telemetry (`handleTelemetryBatch()`, `appendExternalObservations()` both via one `writeQueue`
│   │   promise chain so seq/hash/fusion assignment never races — `flush()` lets a caller await everything
│   │   queued so far), `recordProducerHeartbeat()` drives producer-health checks, AND (Phase 7) owns the
│   │   in-memory `FusionState` (NOT Redis-checkpointed — no mid-LIVE process resume exists at all yet, so
│   │   this matches the existing gap rather than adding partial recovery for just one piece of state):
│   │   every appended observation is fed through `fusion.engine.applyObservation` inline (no separate
│   │   200ms tick — see Decisions log), non-calibrating crossings go to `flag-builder.processFlagCrossing`
│   │   then `warden.evaluateWarden`; `snapshotIntegrity()` (decay-to-now, no I/O) backs both the 2s
│   │   `integrity.tick` and the 10s persisted `IntegritySnapshot` row, and lets `flag.service` verify a
│   │   dismiss actually raised the live score; `applyAdjudication()` nudges one channel's accumulator
│   │   for CONFIRM/DISMISS/DOWNGRADE (approximate — Phase 10 IntegrityRescore is the authoritative one)
│   ├── live/registry.ts          sid -> SessionRuntime in-memory map
│   ├── live/timer.ts             computeTimerState(startedAt, durationMinutes, now) — pure, unit-tested;
│   │   per-topic budget burn still deferred (no live topic tracking yet)
│   ├── live/ingest.ts            TelemetryIngest — per-connection clock correction (offset passed in per
│   │   call, since Design.md's `clock.offset` has no connId of its own) + Redis-backed seq dedup/gap
│   │   detection (`s:{sid}:conn:{connId}:seq`, FR-TEL-1/2)
│   ├── live/calibration.ts       Baseline — collects rhythm (keystroke variance) samples during the
│   │   first 60s; RhythmDetector reads it once ready
│   ├── live/detectors/           focus, paste, pointer, env, rhythm .detector.ts — pure classes, no I/O
│   │   (Rules.md §5); ks-test.ts (two-sample KS statistic); types.ts (TelemetryEvent, DetectorObservation)
│   ├── live/producer-health.ts   ProducerHealthMonitor — pure OK/DEGRADED/stale-heartbeat state machine;
│   │   SessionRuntime does the I/O (system.degraded emit, unscored windows, channel freeze) from its
│   │   transitions
│   ├── live/fusion/fusion.engine.ts  pure: `applyObservation` (decay + corroboration boost + floor),
│   │   `projectState`/`computeScoreFromAccumulators` (decay-to-now for display without mutating state),
│   │   `computeIntegrity`, `severityBand`, `crossedThreshold`, `computeIntegrityDelta` (integrity
│   │   before/after one observation, holding every other channel fixed — gives `Flag.scoreDelta`)
│   ├── live/fusion/flag-builder.ts  `processFlagCrossing()` — merges a same-`type` repeat into any open
│   │   flag from the last 15s regardless of re-crossing; otherwise only creates a new Flag on an actual
│   │   upward threshold crossing; interviewer-only narrative templates (never candidate-facing wording)
│   ├── live/fusion/unscored.ts   recordUnscoredWindow / closeOpenUnscoredWindows (UnscoredWindow rows,
│   │   moved here from `live/unscored.ts` in Phase 7 to match Architecture.md's tree) +
│   │   `FrozenChannelTracker` (pure in-memory: a channel can be frozen for >1 reason at once; stays
│   │   frozen — no decay, no new evidence, 0 score contribution — until every reason clears)
│   ├── live/warden.ts            `evaluateWarden()` — tier by occurrence count + severity, 45s per-type
│   │   cooldown, cap 6 above-tier-1 warnings then downgrade to NOTICE, fixed candidate-facing templates
│   │   (only for the 7 types Design.md §6 actually gives wording for — a type with none just never shows
│   │   a warning, the flag still exists); `acknowledgeWarning()` — `warn.ack` → ackLatencyMs → flag.update
│   ├── services/lifecycle.service.ts  startSession (guards: ADMITTED, !needsReconsent, Redis
│   │   mediaReady==="1"; creates+starts SessionRuntime, ADMITTED→LIVE), endSession (idempotent once past
│   │   LIVE; destroys runtime; LIVE→SEALING→PROCESSING — seal is a stub until Phase 9), getLiveSnapshot
│   │   (dashboard-reload hydrate: status, elapsedMs/remainingMs, mediaReady, integrity, flags, notes,
│   │   lastFrameSeq — transcriptTail/suggestions/degraded from Design.md §4.10 still not included)
│   ├── services/flag.service.ts  listFlags (with latest warning + adjudication history per flag),
│   │   adjudicateFlag (role/binding check done here, not middleware, since `/flags/:flagId` has no
│   │   session id in the URL; nudges the live accumulator via `runtime.applyAdjudication`)
│   ├── services/note.service.ts  listNotes, addNote (mediaOffsetMs always null — no recording anchor
│   │   exists until Phase 9)
│   ├── services/suggestion.service.ts  refreshSuggestions (manual trigger only — see Known issues),
│   │   acceptSuggestion
│   ├── utils/queues.ts           BullMQ Queue instances (jdParseQueue, linkExpiryQueue) + QUEUE_NAMES
│   ├── utils/events.ts           publishSessionEvent(sid, event, payload) → redis.publish("events:{sid}");
│   │   now actually consumed by sockets/event-subscriber.ts and forwarded to the dashboard
│   ├── types/express.d.ts        req.requestId, req.input, req.user, req.sessionRecord,
│   │   req.joinTokenRecord, req.candidateContext
│   ├── types/parsed-jd.ts        zod ParsedJD schema
│   └── utils/prisma, redis, logger, app-error, respond, ids, hash, jwt (access/join/candidate tokens)
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
| 2026-09-17 | Join JWTs carry no `exp` claim; expiry/revocation/consumption are enforced only from `join_tokens` in Postgres | Rules.md §9 says verify signature **and** DB state on every call — putting `exp` on the JWT too would create two sources of truth that could disagree (e.g. a revoked-but-not-yet-expired token) |
| 2026-09-17 | Invite emails on link creation are sent synchronously via `getMail()` inside `link.service.createLink`, not through a dedicated `email.worker.ts` + BullMQ queue | Phases.md lists an email worker, but the mail provider call is already fire-and-forget-safe (mock/log providers never throw) and scope was tight; revisit if a real SMTP provider's latency starts blocking the request |
| 2026-09-17 | No `session-schedule.worker.ts` T-15m reminder job; only link expiry (ARMED→EXPIRED) is implemented as a delayed BullMQ job (`workers/link-expiry.worker.ts`) | The T-15m reminder has no observable behavior yet (Phases.md says "log + future hooks") and no endpoint depends on it; link expiry is the one with real state-machine consequences, so it got priority |
| 2026-09-17 | Policy bullets and `policyHash` are computed fresh on every `GET .../policy` and re-verified at consent time via `join.service.buildPolicy()`, not cached | `policyHash` must reflect the *current* config (Design.md `POLICY_CHANGED`); computing on demand from `configVersion` + channels + recording flags is simpler than invalidating a cache |
| 2026-09-17 | `express@5.2`'s `app.set("trust proxy", 1)` plus `req.ip` is used for the consent IP hash; sockets run on the same `http.Server` as Express (`createSocketServer(server)`), not a separate port | Matches Architecture.md's single-process design; no separate realtime service to deploy |
| 2026-09-17 | `endSession` is idempotent for any status past LIVE (SEALING/PROCESSING/COMPLETE/ABORTED/EXPIRED) — returns the current session instead of throwing | A duration-limit timer and an interviewer's own `POST /end` could race; the second caller should see success, not `INVALID_STATE_TRANSITION` |
| 2026-09-17 | Seal (`LIVE→SEALING→PROCESSING`) is a stub in `lifecycle.service.endSession`: both transitions fire back-to-back with no real seal sequence | Phases.md Phase 5 says exactly this ("seal is a stub in this phase that goes straight to PROCESSING"); the real 9-step seal lands in Phase 9 |
| 2026-09-18 | `clock.offset`'s per-connection value (Design.md §5.4 has no `connId` on that event) is stored on the socket itself (`socket.data.clockOffsetMs`) and passed into `SessionRuntime.handleTelemetryBatch()` per call, rather than `TelemetryIngest` tracking it by the client's `connId` | Only `tel.batch` carries an explicit `connId` (so seq/dedup can survive a reconnect that keeps the same logical connection); `clock.offset` doesn't, so it's naturally a property of the current socket, not the durable connId |
| 2026-09-18 | A telemetry sequence gap opens one `UnscoredWindow` (reason `SEQUENCE_GAP`) per client-observable channel (FOCUS/PASTE/RHYTHM/POINTER/ENVIRONMENT), immediately closed at the same instant, rather than tracking which specific channel(s) the missed batch would have covered | `UnscoredWindow.channel` is required and a gap is connection-level, not channel-level — the client doesn't say what was in the skipped batch. Point-in-time markers are enough for Phase 6's "never evidence of evasion" requirement (FR-TEL-2); revisit if Phase 7's fusion engine needs a duration instead of a marker |
| 2026-09-18 | Internal API responses (`/internal/sessions/:id/*`) `await runtime.flush()` before returning 202, so the write has actually landed by the time the producer gets a response, but a write failure is only logged (via the write queue's `.catch`), not turned into a 500 for the caller | Matches the existing "mock providers never throw" / JD-worker-is-best-effort pattern rather than adding a second error-propagation path through the serialized write queue; revisit if a real CV/ASR producer needs a hard failure signal to retry |
| 2026-09-18 | Media-track grace (camera 15s / screen 10s loss → clock freeze + unscored) and the "visible while screen muted" impossible-state check from Phases.md Phase 6 are **not implemented** | Both need server-side truth about media tracks, which only exists via a LiveKit webhook (`webhooks/livekit`, Architecture.md §8) that hasn't been built in any phase yet — the media provider is still the mock, and no webhook route exists. Candidate telemetry alone can't report screen-mute state. Revisit when LiveKit/webhook infrastructure is actually added (Phase 9 seal work is the next place that touches recording/media) |
| 2026-09-18 | `live/unscored.ts` (Phase 6) moved to `live/fusion/unscored.ts` and gained `FrozenChannelTracker` | Architecture.md's file tree puts `unscored.ts` under `live/fusion/` alongside `fusion.engine.ts`/`flag-builder.ts`; Phase 6 didn't have that folder yet, so it started one level up. Consolidated in Phase 7 rather than leaving two competing "unscored window" concepts |
| 2026-09-18 | No dedicated 200ms "fusion tick" timer, and `FusionState` is **not** checkpointed to Redis (Architecture.md's `s:{sid}:fusion`) | Decay is purely a function of elapsed time since a channel's `lastTs`, so updating the accumulator inline, in the same serialized write as the evidence append, is mathematically identical to a separate tick draining a queue — it just skips reinventing a second queue. No Redis checkpoint because there is no mid-LIVE process-resume mechanism for `SessionRuntime` at all yet (nothing resumes a crashed runtime today); adding one just for fusion state would be a partial, misleading safety net. `snapshotIntegrity()`/`projectState()` still do the "decay to now" math for display (2s `integrity.tick`, 10s `IntegritySnapshot`) without mutating the stored state |
| 2026-09-18 | Flag merge does not require re-crossing the threshold: any observation of the same `type` within 15s of an OPEN flag merges into it regardless of whether the accumulator dipped and re-crossed; a brand-new flag still requires an actual upward crossing | Architecture.md §6.4 step 6 says "same type within 15s of an open flag → extend/merge", with no mention of re-crossing — read literally, an accumulator that's already above threshold would otherwise never re-fire `crossedThreshold` (before is already ≥ threshold), so repeats would silently vanish instead of extending the flag |
| 2026-09-18 | Adjudication (`DISMISS`/`DOWNGRADE`) nudges the live fusion accumulator by subtracting the sum of the flag's linked observations' raw LLR (× 1.0 for DISMISS, × 0.5 for DOWNGRADE) from that channel, ignoring decay/corroboration that applied since | It's a live-only, best-effort correction so the dashboard visibly recovers after a dismiss (Phase 7's "Done when" scenario); the exact, decay-aware recompute is Phase 10's `IntegrityRescore`, which replays fusion from scratch over all observations + adjudications — not worth building twice |
| 2026-09-18 | `CALIBRATION_MS` and `WARDEN_COOLDOWN_MS` are shortened when `NODE_ENV=test` (200ms and 100ms vs 60s/45s in real life) | Same precedent as the `/auth` rate limiter's test-only limit: flag/warden integration tests would otherwise need a real 60s+45s wall-clock wait per test. Asked the user first since CLAUDE.md flags constants.ts changes; approved this exact pattern |
| 2026-09-18 | `suggestion.service.refreshSuggestions` only wires the manual `POST .../suggestions/refresh` trigger, not the automatic "topic change" / "answer end" triggers Phases.md also lists | Both automatic triggers need live topic tracking and ASR turn-detection that don't exist in any phase yet (topic budgets are a known Phase 5/6 gap; transcript ingest has no turn/topic labelling). Wiring a trigger to infrastructure that isn't there would be a no-op; the manual endpoint is fully real (MockLlmProvider, 2.5s timeout → question-bank fallback) |
| 2026-09-18 | `GET /sessions/:id/live` gained `integrity` and `flags`/`notes` fields but still doesn't include `transcriptTail`, `suggestions`, or `degraded` from Design.md §4.10's hydrate shape | Those three need more plumbing (transcript history query, latest suggestion batch, producer-health state exposed outside the runtime) than the phase's scope justified; the socket already pushes `transcript.partial/final`, `qs.suggestions`, and `system.degraded` live, so a dashboard that was already open doesn't miss anything — only a fresh reload mid-session would |

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
- No `.ics` calendar attachment on invite emails yet (Phases.md mentions one for scheduled mode) — the
  invite email is a plain text link. Add when a real mail provider is wired up.
- `GET /join/:token` doesn't block on `notBefore` (only reports `NOT_YET_OPEN` in the `status` field);
  preflight/policy/consent on a not-yet-open link still work today. No Design.md error code exists for
  "too early", so this is intentionally permissive until a real requirement shows up.
- Retention/viewers text in the consent policy is generic (`DEFAULT_RETENTION_DAYS = 90`), not derived
  per-data-type like Phase 11's actual retention job (90d media / 180d observations / 3y reports). Revisit
  wording once Phase 11 lands so the candidate-facing number matches reality.
- `timer.tick`'s `topics: [{name, budgetSeconds, usedSeconds}]` from Design.md §5.2 is not emitted yet —
  only `{elapsedMs, remainingMs, frozen: false}`. There's no live topic-tracking mechanism until the
  suggestion engine (Phase 7) exists. `frozen` is hardcoded `false` since clock-freeze (media grace) isn't
  wired up until Phase 6.
- `media.state` from Design.md §5.2 still doesn't exist — needs the same LiveKit webhook infra as media
  grace (see above). Everything else in that table now exists as of Phase 7: `integrity.tick`,
  `flag.new/update`, `warn.issued`, `qs.suggestions`, `note.added`, `system.degraded`,
  `transcript.partial/final`. `INTERVIEWER_EVENTS`/`CANDIDATE_EVENTS` in `sockets/events.ts` only list
  what's implemented so far; keep adding to those objects (not ad-hoc string literals) as later phases add events.
- Candidate-side `task.frozen`, `media.required` aren't implemented yet (Phase 8-9). `warn.show` now
  exists (Phase 7); `session.state`, `session.ended` existed since Phase 5.
- `timer.tick`'s `frozen` field is still hardcoded `false` — media-grace clock freeze isn't implemented
  (see the Phase 6 decision above on why: no LiveKit webhook exists yet).
- Phase 6 known gaps (Phases.md lists these; not built — see Decisions log for why): media-track grace
  (camera/screen loss → clock freeze + unscored) and the impossible-state (`data_integrity`) audit check.
  Both need a media webhook that doesn't exist in this codebase yet.
- `raf_gap` telemetry events are accepted and validated but not routed to any detector — no `type` in
  `config/detection.ts` maps to it. It's schema-valid so it won't be dropped as invalid, it just produces
  no observation. Revisit if a "rendering stall" signal becomes part of a channel's evidence.
- `EnvDetector`'s `device_change` observation always uses a flat `strength: 0.5` (no natural intensity
  scale for a single boolean add/remove event, unlike focus duration or pointer duration). Revisit if a
  richer signal (e.g. how many devices, how often) becomes available.
- The rhythm baseline (`live/calibration.ts` `Baseline`) is only fed during the first 60s and then frozen
  for the rest of the session — it does not slowly adapt afterward. Matches Architecture.md §6.4 step 8
  literally ("baselines during first 60s"); revisit if long sessions need drift correction.
- `session-runtime.test.ts` uses `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` around real Redis
  I/O (lease set/renew) — this works because fake timers only intercept JS timer functions, not network
  I/O, but keep that in mind if a future test needs to fake `Date.now()` too (would need `shouldAdvanceTime`
  or explicit `Date` mocking to avoid skewing `computeTimerState`).
- Warden only has candidate-facing templates for 7 of Design.md §6's 9 types: `SCREEN_SHARE_STOPPED` (no
  detector — needs the same media webhook as everything else media-grace related) and `TYPING_BURST` (a
  Phase 8 authorship-detector concept, not the Phase 6 rhythm/KS-test anomaly) have no template, so those
  types can never produce a `warn.show` even if something eventually flags them. Add the row to
  `live/warden.ts`'s `WARNING_MESSAGES` once the detector exists — never invent wording ahead of that.
- `sockets/index.ts`'s `note.add` handler picks the first room starting with `session:` out of
  `socket.rooms` — correct today because an interviewer socket only ever joins one session room via
  `session.join`, but would misbehave if that ever changes to support multiple concurrent sessions per socket.
- `suggestion.service.refreshSuggestions` and `GET /sessions/:id/live` gaps: see Decisions log (manual
  trigger only; hydrate missing transcriptTail/suggestions/degraded).
- Phase 7's fusion state lives only in `SessionRuntime` memory, not Redis (see Decisions log) — a process
  crash/restart mid-LIVE loses the live accumulator (all raw observations are still safely in Postgres, so
  Phase 10's `IntegrityRescore` is unaffected; only the *live* dashboard score would reset to 100 until new
  evidence arrives). No worse than every other mid-LIVE state SessionRuntime already can't resume.

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

### 2026-09-18 — Phase 7 fusion, flags, warden, dashboard loop
- Phase: 7
- Built: `live/fusion/fusion.engine.ts` (pure: per-channel decay+corroboration-boost+floor in
  `applyObservation`, `projectState`/`computeScoreFromAccumulators` for decay-to-now display without
  mutating state, `computeIntegrity`, `severityBand`, `crossedThreshold`, `computeIntegrityDelta` for
  `Flag.scoreDelta`); `live/fusion/flag-builder.ts` (`processFlagCrossing` — merges a same-type repeat
  into any open flag from the last 15s regardless of re-crossing, otherwise only creates a new Flag on an
  actual upward crossing; interviewer-only narrative templates); `live/fusion/unscored.ts` (moved from
  `live/unscored.ts`, added `FrozenChannelTracker`); `live/warden.ts` (tier by occurrence+severity, 45s
  per-type cooldown, cap 6 above-tier-1 then downgrade to NOTICE, fixed templates for 7 Design.md §6
  types, `acknowledgeWarning` for `warn.ack` → ackLatencyMs → flag.update); `SessionRuntime` extended to
  own the in-memory `FusionState`, feed every appended observation through fusion+flag-builder+warden
  inline (no separate 200ms tick, no Redis checkpoint — see Decisions log), 2s `integrity.tick` + 10s
  persisted `IntegritySnapshot` via `snapshotIntegrity()`, `applyAdjudication()` for the live-score nudge;
  `services/flag.service.ts` (listFlags with latest warning + adjudication history, adjudicateFlag doing
  its own org/role check); `services/note.service.ts`; `services/suggestion.service.ts` (MockLlmProvider
  with a 2.5s timeout → question-bank fallback, manual refresh trigger only); REST: `GET
  /sessions/:id/flags`, `POST /flags/:flagId/adjudicate`, `GET/POST /sessions/:id/notes`, `POST
  /sessions/:id/suggestions/refresh`, `POST /sessions/:id/suggestions/:suggestionId/accept`; sockets:
  candidate `warn.ack`, interviewer `note.add`; `getLiveSnapshot` gained `integrity`/`flags`/`notes`
- Files: `src/live/fusion/{fusion.engine,flag-builder,unscored}.ts`, `src/live/warden.ts`,
  `src/services/{flag,note,suggestion}.service.ts`, `src/controllers/flag.controller.ts`,
  `src/routes/flag.routes.ts`, `src/validators/live.schema.ts`, edits to `src/live/session-runtime.ts`,
  `src/config/{constants,detection}.ts`, `src/sockets/{index,events}.ts`,
  `src/controllers/session.controller.ts`, `src/routes/{session,index}.routes.ts`,
  `src/services/lifecycle.service.ts`
- Schema/migrations: none (Flag/FlagObservation/FlagAdjudication/Warning/Note/QuestionSuggestion/
  IntegritySnapshot already existed from the initial schema)
- New env vars: none
- Tests: 139 passing total (35 new: `tests/unit/fusion-engine.test.ts` — decay math with fixed timelines,
  corroboration boost + cap, floor, computeIntegrity/severityBand/crossedThreshold,
  computeIntegrityDelta; `tests/integration/live.test.ts` — calibration gates flag creation, threshold
  crossing → flag → 15s merge, warden tier progression (needed shrinking `WARDEN_COOLDOWN_MS` in test
  env, see Decisions log) + severity-first-occurrence + cooldown-suppression + no-template-silent-noop +
  above-tier-1 cap, warn.ack latency, adjudicate confirm/dismiss/downgrade incl. cross-org 404, dismiss
  measurably raising `snapshotIntegrity()` (the full "crossing → flag → dismiss → recovers" loop), notes
  REST + socket, suggestions refresh + accept, candidate-boundary scan of every `/candidate` emit across a
  scripted session including a real `warn.show`). `npm run typecheck`, `npm run build` clean; `npm run
  dev` smoke-tested boot + `/ready` against real Postgres/Redis
- Decisions: see Decisions log (unscored.ts relocated under live/fusion/, no 200ms tick or Redis
  checkpoint for fusion state, merge doesn't require re-crossing, adjudication nudge is approximate,
  CALIBRATION_MS/WARDEN_COOLDOWN_MS shortened in test env — asked the user first per CLAUDE.md, suggestion
  triggers are manual-only, live snapshot hydrate still partial)
- Issues left: see Known issues (2 of 9 warning types have no template yet, note.add's single-room
  assumption, no automatic suggestion triggers, fusion state not crash-resumable)
- Next: Phase 8 — Coding round. Wait for "next".

### 2026-09-18 — Phase 6 telemetry ingest, evidence chain, detectors
- Phase: 6
- Built: `config/detection.ts` (server-only LLR table by type×sensitivity, channel weights/decay/
  thresholds, fusion sigma, corroboration/merge tunables — only `getLlr()` is consumed before Phase 7);
  5 pure detectors under `live/detectors/` (focus — ignores blur/hidden under 800ms; paste — clipboard
  paste ≥40 chars; pointer — leave ≥800ms; env — multi-screen/device-change/network; rhythm — two-sample
  KS test of keystroke-interval variance vs the calibration baseline) + `ks-test.ts`; `live/calibration.ts`
  `Baseline` (collects rhythm samples for the first 60s); `live/ingest.ts` `TelemetryIngest` (Redis-backed
  per-connection seq dedup/gap detection, clock-offset correction); `services/evidence.service.ts`
  `appendObservations()` (assigns seq/prevHash/hash per Architecture.md §7.4, batch-inserts, updates the
  Redis chain head); `live/unscored.ts` (open/close `UnscoredWindow` rows); `live/producer-health.ts`
  `ProducerHealthMonitor` (pure OK/DEGRADED/stale state machine); `SessionRuntime` extended to own all of
  the above behind one serialized `writeQueue` (`handleTelemetryBatch`, `appendExternalObservations`,
  `recordProducerHeartbeat`, `flush`); candidate socket gained `clock.sync`/`clock.offset`/`tel.batch`
  handlers; internal API `POST /api/v1/internal/sessions/:id/{observations,transcript,heartbeat}`
  (service-token authed) with `middlewares/service-token.ts`, `validators/internal.schema.ts`,
  `services/internal.service.ts`, `controllers/internal.controller.ts`, `routes/internal.routes.ts`;
  transcript ingest marks overlapping non-final segments `supersededAt` when a final segment lands, and
  emits `transcript.partial`/`transcript.final`; producer DEGRADED (self-reported or stale heartbeat)
  emits `system.degraded` and opens `DETECTOR_DOWN` unscored windows per channel, closed on recovery
- Files: `src/config/detection.ts`, `src/live/{ingest,calibration,producer-health,unscored}.ts`,
  `src/live/detectors/{types,ks-test,focus,paste,pointer,env,rhythm}.detector.ts` (detector files) and
  `ks-test.ts`/`types.ts`, `src/services/{evidence,internal}.service.ts`,
  `src/controllers/internal.controller.ts`, `src/routes/internal.routes.ts`,
  `src/validators/internal.schema.ts`, `src/middlewares/service-token.ts`, edits to
  `src/live/session-runtime.ts`, `src/sockets/{index,events}.ts`, `src/services/lifecycle.service.ts`,
  `src/routes/index.ts`, `src/config/{env,constants}.ts`
- Schema/migrations: none (Observation/UnscoredWindow/TranscriptSegment already existed from the initial schema)
- New env vars: `INTERNAL_SERVICE_TOKEN` (required, ≥32 chars) — added to `.env`, `.env.example`,
  `.env.test`, `.env.test.example`, `tests/setup.ts`
- Tests: 104 passing total (32 new: `tests/unit/{detectors,calibration,producer-health}.test.ts`,
  `tests/integration/telemetry.test.ts` — chained observations with a verified recomputed hash, LLR
  assignment, duplicate-seq dedup, sequence-gap → 5 unscored windows, internal API auth rejection,
  CV observations continuing the same chain, rejection when the session isn't LIVE, transcript
  partial→final superseding, producer DEGRADED→system.degraded→unscored→recovery). `npm run typecheck`,
  `npm run build` clean; `npm run dev` smoke-tested boot + `/ready` against real Postgres/Redis
- Decisions: see Decisions log (clock-offset on socket not connId, gap → 5-channel point-in-time unscored
  markers, internal API awaits the write queue before responding but doesn't propagate write failures,
  media-track grace and the impossible-state check deferred — no LiveKit webhook exists in this codebase)
- Issues left: see Known issues (raf_gap unrouted, device_change flat strength, baseline frozen after
  calibration, media grace / impossible-state check deferred)
- Next: Phase 7 — Fusion, flags, warden, dashboard loop. Wait for "next".

### 2026-09-17 — Phase 5 realtime hub and lifecycle
- Phase: 5
- Built: Socket.IO server (`sockets/index.ts`) with `/interviewer` (access JWT, `session.join` event with
  ack + replay) and `/candidate` (candidate JWT, auto-join) namespaces, both attached to the same
  `http.Server` as Express; `sockets/emitter.ts` (frame-sequenced, Redis-buffered `emitToInterviewers`,
  unbuffered `emitToCandidate`, `replayFrom`); `sockets/event-subscriber.ts` (Redis `events:*`
  pattern-subscribe forwarding worker events, e.g. `jd.parsed`, to the dashboard — the subscriber
  `utils/events.ts publishSessionEvent` was writing to since Phase 2 finally has a listener);
  `live/session-runtime.ts` (per-session lease, 1s `timer.tick`, candidate presence + 120s abandon grace,
  duration-limit timer), `live/registry.ts`, `live/timer.ts` (pure, unit-tested);
  `services/lifecycle.service.ts` (`startSession` guards ADMITTED/!needsReconsent/mediaReady,
  `endSession` idempotent past LIVE with a stubbed seal straight to PROCESSING, `getLiveSnapshot`);
  `POST /sessions/:id/start`, `POST /sessions/:id/end`, `GET /sessions/:id/live`
- Files: `src/sockets/*`, `src/live/*`, `src/services/lifecycle.service.ts`, edits to
  `src/controllers/session.controller.ts`, `src/routes/session.routes.ts`, `src/index.ts`
- Schema/migrations: none
- New env vars: none
- Tests: 72 passing total (13 new: `tests/unit/timer.test.ts`, `tests/integration/session-runtime.test.ts`
  using fake timers for abandon-grace and duration-limit, `tests/integration/lifecycle.test.ts` using a
  real ephemeral HTTP server + `socket.io-client` for auth rejection, room isolation via `session.join`
  ack, buffered-frame replay, and the full start→LIVE→end→PROCESSING REST flow with guards). `npm run
  typecheck` and `npm run build` clean; also smoke-tested `npm run dev` boots with sockets attached and
  `/ready` still returns ok.
- Decisions: see Decisions log (single-process sockets, idempotent endSession, stubbed seal, no exp on
  join JWT already noted Phase 4)
- Issues left: see Known issues (topic-budget timer fields, later-phase socket events not implemented yet)
- Next: Phase 6 — telemetry ingest, evidence chain, detectors

### 2026-09-17 — Phase 4 arming and candidate join
- Phase: 4
- Built: `utils/jwt.ts` join/candidate token sign+verify (join JWT has no `exp`, DB-gated instead;
  candidate JWT expires at duration+2h); `link.service.ts` (create mints jti + JWT + `join_tokens` row,
  CONFIGURED→ARMED, schedules a BullMQ delayed expiry job, sends invite email via `getMail()` when
  `sendInvite` and a candidate email exist; list; revoke); `workers/link-expiry.worker.ts` (ARMED + never
  consented when the delay fires → EXPIRED); `middlewares/join-token.ts` (signature + live DB state:
  revoked/consumed/expired, checked fresh every call) and `candidate-token.ts`; `join.service.ts`
  (summary with READY/NOT_YET_OPEN, preflight probe evaluation → blocking failures vs zero-weight
  warnings, policy bullets built from live config with a recomputed `policyHash`, consent accept →
  Consent row + one-time consumption + ARMED→ADMITTED + clears `needsReconsent` + candidate/media
  tokens, consent decline → ABORTED `candidate_declined`); `media.service.ts` (`markMediaReady` via
  mock media provider → Redis `s:{sid}:state.mediaReady`); `candidate.service.ts` (`GET
  /candidate/session` allow-list DTO); `tests/helpers/candidate-boundary.ts` (`assertNoForbiddenKeys`,
  scans a payload for score/flag/severity/threshold/weight/sensitivity/channel/hiddenTest keys)
- Files: `src/services/{link,join,media,candidate}.service.ts`,
  `src/controllers/{link,join,candidate}.controller.ts`, `src/routes/{link,join,candidate}.routes.ts`,
  `src/validators/{link,join,candidate}.schema.ts`, `src/middlewares/{join-token,candidate-token}.ts`,
  `src/workers/link-expiry.worker.ts`, `tests/helpers/candidate-boundary.ts`,
  `src/types/express.d.ts` (added `req.joinTokenRecord`, `req.candidateContext`)
- Schema/migrations: none (schema already had JoinToken/PreflightCheck/Consent from Phase 0)
- New env vars: `JOIN_TOKEN_SECRET`, `CANDIDATE_TOKEN_SECRET` (both required, ≥32 chars)
- Tests: 59 passing total (10 new in `tests/integration/join.test.ts`) — link creation transitions to
  ARMED, full join→preflight→policy→consent→ADMITTED happy path with candidate-boundary checks on every
  candidate-reachable response, one-time link consumed after consent, policyHash mismatch after a config
  change during the join flow, decline path aborts with `candidate_declined`, failing preflight blocks
  consent with `PREFLIGHT_REQUIRED`, revoked/expired/unknown-jti link error codes, candidate token auth
  guard. `npm run typecheck` and `npm run build` clean; also manually verified live end-to-end against
  real Postgres/Redis with both workers running (register → session → config → link → join → preflight →
  policy → consent → candidate session).
- Decisions: see Decisions log (no `exp` on join JWT, sync invite email instead of a worker, link-expiry
  only — no T-15m reminder worker, policy computed on demand)
- Issues left: see Known issues
- Next: Phase 5 — realtime hub and lifecycle

### 2026-09-17 — Phase 3 task bank and question bank
- Phase: 3
- Built: coding task CRUD (`coding-task.service.ts` — list/get exclude `hiddenTests` unless caller is
  OWNER/ADMIN; delete blocked if attached to any session), question bank CRUD with topic/difficulty
  filters (`question-bank.service.ts`), `prisma/seed.ts` (demo org, owner + interviewer user, 3 coding
  tasks, 20 question bank items; `npm run db:seed`, also wired as `prisma.seed` for `prisma db seed`)
- Files: `src/{services,controllers,routes,validators}/{coding-task,question-bank}.*`, `prisma/seed.ts`
- Schema/migrations: none
- New env vars: none
- Tests: 49 passing total (5 new in `tests/integration/coding-task.test.ts`) — hiddenTests hidden from
  list and from non-admin single-task reads, role guard on writes, delete-blocked-when-attached,
  question-bank topic filter, role guard on question delete
- Decisions: none new
- Issues left: none
- Next: Phase 4 — arming and candidate join

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
