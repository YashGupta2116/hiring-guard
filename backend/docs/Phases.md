# Phases.md — VeriTrust Backend

Build strictly in order. Each phase ends with a working, tested backend.
Endpoint and event shapes are in `Design.md`. Requirement IDs (FR-…) are in `PRD.md`.

Status legend: ⬜ not started · 🟨 in progress · ✅ done (update in `Memory.md`, not here)

---

## Phase 0 — Foundation

**Goal:** a clean, running Express 5 + TypeScript + Prisma 7 project with the plumbing every later phase uses.

**Tasks**
- [ ] `package.json` (`"type": "module"`, scripts: `dev`, `build`, `start`, `worker`, `test`, `db:migrate`, `db:generate`, `db:studio`)
- [ ] `tsconfig.json` (NodeNext, strict, `rootDir: src`, `outDir: dist`)
- [ ] `prisma.config.ts` at backend root; `schema.prisma` in `prisma/`; first migration `init`
- [ ] `docker-compose.yml`: postgres, redis, mailpit
- [ ] `config/env.ts` (zod), `.env.example`
- [ ] `utils/prisma.ts`, `utils/redis.ts`, `utils/logger.ts`, `utils/app-error.ts`, `utils/respond.ts`, `utils/ids.ts`, `utils/hash.ts`
- [ ] `middlewares/`: `request-id`, `validate`, `not-found`, `error-handler`, `rate-limit`
- [ ] `app.ts` (helmet, cors, json, cookie-parser, pino-http, routes, 404, error handler) and `index.ts` (server + graceful shutdown)
- [ ] `GET /api/v1/health` (process up) and `GET /api/v1/ready` (db + redis ping)
- [ ] `vitest` setup with test DB; one test for `/health`
- [ ] Provider interfaces + mock implementations: `storage`, `mail`, `llm`, `media`, `sandbox`, `signer`

**Done when:** `npm run dev` starts, `/ready` returns 200 with db and redis ok, `npm run build` and `npm test` pass,
an unknown route returns the standard 404 envelope, a thrown `AppError` returns the standard error envelope.

---

## Phase 1 — Auth and organisations  (FR-AUTH-1..3, FR-ORG-1)

**Tasks**
- [ ] `validators/auth.schema.ts`, `services/auth.service.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts`
- [ ] Register (user + org + OWNER membership in one transaction)
- [ ] Login (argon2 verify), access JWT (15 min) + refresh token cookie (hashed, rotating, family revoke on reuse)
- [ ] Refresh, logout, `GET /auth/me` (user + memberships + active org)
- [ ] `POST /auth/switch-org`
- [ ] `middlewares/auth.ts` (`requireUser`), `middlewares/org-role.ts` (`requireRole`)
- [ ] Org endpoints: get org, list/add/update/remove members (OWNER/ADMIN only, cannot remove last OWNER)
- [ ] Candidate directory: list/create/get candidates for the org
- [ ] Audit: `audit.service.ts` with `log()`; call it for register, login, member changes
- [ ] Rate limit on `/auth/*`
- [ ] Tests: register/login/refresh rotation/reuse detection/role guard/org isolation

**Done when:** a user from org A can never read or change anything from org B (tested).

---

## Phase 2 — Session setup  (FR-SES-1..2, FR-JD-1..4, FR-CFG-1..2)

**Tasks**
- [ ] `services/session-state.service.ts`: `transition()` with CAS + audit in one transaction + publish `session.state`; unit tests for every allowed and forbidden transition
- [ ] Sessions: create (`ses_<ulid>`, DRAFT, creator bound as primary), list (filters: status, date range; paginated), get, update basic fields (DRAFT/CONFIGURED/ARMED only), cancel → ABORTED
- [ ] Session interviewers: add/remove
- [ ] `middlewares/session-access.ts`
- [ ] JD: `POST /sessions/:id/jd` (multipart file or JSON text; MIME + magic-byte check; 10 MB) → storage → `job_descriptions` PENDING → queue `jd-parse` → 202
- [ ] `utils/queues.ts` + `src/worker.ts` + `workers/jd-parse.worker.ts`: extract text (`pdf-parse`/`mammoth`), `llm.parseJd()` (mock returns deterministic ParsedJD from keywords), zod-validate, compute topic budgets, set PARSED or FAILED, publish `jd.parsed` on `events:{sid}`
- [ ] `GET /sessions/:id/jd`, `PATCH /sessions/:id/jd` (edit parsed → `edited = true`), `POST /sessions/:id/jd/reparse`
- [ ] Config: `PATCH /sessions/:id/config` (validate tasks belong to org; DRAFT → CONFIGURED; channel added after consent → `needsReconsent = true`, `configVersion++`)
- [ ] Tests: upload flow with mock worker, parse failure path, config transition, re-consent flag

**Done when:** you can create a session, upload a PDF, see it become PARSED (or FAILED without blocking), edit it, and configure the session to CONFIGURED.

---

## Phase 3 — Task bank and question bank

**Tasks**
- [ ] Coding tasks CRUD (OWNER/ADMIN write, all members read; `hiddenTests` never returned to non-admin list views unless needed)
- [ ] Question bank CRUD with filter by topic/difficulty
- [ ] Attach/detach/reorder coding tasks on a session (`session_coding_tasks`), only before LIVE
- [ ] Seed script `prisma/seed.ts`: demo org, 2 users, 3 tasks, 20 bank questions

**Done when:** a CODING session can be configured with real task IDs from the bank.

---

## Phase 4 — Arming and candidate join  (FR-LINK-1..3, FR-JOIN-1..5)

**Tasks**
- [ ] `utils/jwt.ts`: join token and candidate token sign/verify (`jose`)
- [ ] `POST /sessions/:id/links` (ONE_TIME / REUSABLE, window) → `join_tokens` → CONFIGURED → ARMED; `GET` list; `POST .../revoke`
- [ ] Scheduled mode: `email.worker.ts` sends invite with `.ics`; `session-schedule.worker.ts` delayed jobs for T-15 m (log + future hooks) and link expiry → EXPIRED
- [ ] `middlewares/join-token.ts` (signature + jti DB state)
- [ ] `GET /join/:token` public summary (allow-list DTO)
- [ ] `POST /join/:token/preflight` (evaluate probe: blocking failures + warnings; extended display = warning, zero weight)
- [ ] `GET /join/:token/policy` (bullets from effective config, retention, viewers, `policyHash`)
- [ ] `POST /join/:token/consent` (accept: verify `policyHash`, store consent with hashed ip/ua + scope + configVersion, consume one-time link, ARMED → ADMITTED, clear `needsReconsent`, return candidate token + media token; decline: → ABORTED `candidate_declined`)
- [ ] `middlewares/candidate-token.ts`; `GET /candidate/session` (allow-list DTO)
- [ ] `media.service.ts` + `POST /candidate/media-ready` (mock provider: always 3 tracks; LiveKit provider: verify cam, mic, screen via server API) → Redis `s:{sid}:state.mediaReady`
- [ ] **Candidate boundary test** harness (scans every candidate REST response for forbidden keys) — keep extending in later phases
- [ ] Tests: consumed link, revoked link, expired link, policy hash mismatch after config change, decline path

**Done when:** a scripted candidate can go link → preflight → policy → consent → media-ready, and the session is ADMITTED.

---

## Phase 5 — Realtime hub and lifecycle  (FR-LIVE-1, FR-DASH-2, FR-GRACE-1 partial)

**Tasks**
- [ ] `sockets/index.ts`: Socket.IO server, `/interviewer` (access JWT) and `/candidate` (candidate token) namespaces
- [ ] `sockets/events.ts`: event name constants + zod payload schemas for everything in `Design.md` §5
- [ ] `sockets/emitter.ts`: frame seq, `s:{sid}:buf` (2000), `resume { lastFrameSeq }` replay
- [ ] Redis `events:{sid}` subscriber forwarding worker events (`jd.parsed`, later `report.ready`)
- [ ] `live/registry.ts` + `live/session-runtime.ts` skeleton: lease acquire/renew/release, serial input queue, timers
- [ ] `POST /sessions/:id/start` (ADMITTED → LIVE; guards: mediaReady, !needsReconsent; creates runtime; calibration end at +60 s)
- [ ] `live/timer.ts`: `timer.tick` every 1 s with elapsed, remaining, per-topic budget burn; clock freeze support; duration limit → end
- [ ] `POST /sessions/:id/end` (LIVE → SEALING; seal is a stub in this phase that goes straight to PROCESSING)
- [ ] Candidate socket presence + 120 s grace → auto-end `candidate_abandon`
- [ ] `GET /sessions/:id/live` hydrate snapshot for dashboard reload
- [ ] Tests: socket auth rejection, room isolation, resume replay, start guards, abandon after grace (fake timers)

**Done when:** interviewer and candidate sockets connect, Start moves to LIVE, both get `session.state`, timer ticks arrive, End works.

---

## Phase 6 — Telemetry ingest, evidence chain, detectors  (FR-TEL-1..2, FR-DET-1..3, FR-EVD-1, FR-LIVE-2)

**Tasks**
- [ ] Candidate `clock.sync` (3-round offset) and `tel.batch` handler → `live/ingest.ts` (clock correction, per-connection seq check, dedup, replay acceptance, unreplayable gap → unscored window)
- [ ] `services/evidence.service.ts`: `append()` assigning seq + prevHash + hash (canonical JSON) inside the runtime; batch inserts
- [ ] `live/calibration.ts`: baselines during first 60 s (rhythm distribution, pointer, focus rates)
- [ ] Detectors (pure, unit-tested): focus (ignore < 800 ms), paste, rhythm (two-sample KS vs baseline), pointer, env (display count, devicechange, network)
- [ ] `config/detection.ts`: LLR tables per type × sensitivity, channel weights, thresholds, decay τ, versions
- [ ] Internal API: `POST /api/v1/internal/sessions/:id/observations`, `/transcript`, `/heartbeat` (service token); `live/producer-health.ts` → `system.degraded` + unscored windows
- [ ] Media grace: webhook / provider events for camera (15 s) and screen (10 s) track loss → clock freeze + unscored
- [ ] Transcript ingest → `transcript_segments` + `transcript.partial` / `transcript.final` to dashboard
- [ ] Impossible-state check (visible while screen muted) → audit `data_integrity`, no flag
- [ ] Tests: chain integrity, seq gap handling, each detector's edge cases, no observations produce flags during calibration

**Done when:** a scripted telemetry stream produces correctly chained `observations` rows with LLR values, and producer silence raises `system.degraded`.

---

## Phase 7 — Fusion, flags, warden, dashboard loop  (FR-FUS-1..2, FR-WARN-1..2, FR-DASH-1, FR-ADJ-1, FR-NOTE-1, FR-QS-1)

**Tasks**
- [ ] `live/fusion/fusion.engine.ts` (decay, floor, corroboration boost, score formula) — pure + unit tests with fixed timelines
- [ ] `live/fusion/flag-builder.ts` (threshold crossing, severity bands, `scoreDelta`, 15 s merge, `flag_observations` links)
- [ ] `live/fusion/unscored.ts` (open/close windows, frozen channels)
- [ ] Runtime ticks: fusion 200 ms (checkpoint to `s:{sid}:fusion`), `integrity.tick` 2 s, `integrity_snapshots` 10 s
- [ ] `live/warden.ts`: tier selection, 45 s cooldown, cap 6 above tier 1, templates; `warn.show` to candidate; `warnings` rows; `warn.ack` → ack latency + `flag.update`
- [ ] Dashboard events: `flag.new`, `flag.update`, `warn.issued` (interviewer view)
- [ ] Flags: `GET /sessions/:id/flags`, `POST /flags/:flagId/adjudicate` (confirm/dismiss/downgrade + reason; creates adjudication row; recompute live integrity)
- [ ] Notes: `GET/POST /sessions/:id/notes` + socket `note.add` (media offset from `startedAt`)
- [ ] Suggestions: `suggestion.service.ts` with 2.5 s timeout on `llm.suggest()` → fallback to question bank; triggers: topic change, answer end, manual refresh; `qs.suggestions`; `POST .../suggestions/:id/accept`
- [ ] Authorship detectors wired later in Phase 8 (leave interface ready)
- [ ] Candidate boundary test over socket: record every `/candidate` emit during a full scripted session and assert no forbidden keys
- [ ] Tests: warden cooldown and cap, merge window, negative evidence recovery, adjudication effect

**Done when:** the full live loop works with mocks: telemetry → flag on dashboard → neutral warning on candidate → ack recorded → interviewer dismisses → score recovers.

---

## Phase 8 — Coding round  (FR-CODE-1..4, FR-DET-2)

**Tasks**
- [ ] `GET /candidate/tasks` (statement, starter code, visible tests only; `frozen` flag)
- [ ] Socket `editor.delta` (every 500 ms) → `editor_deltas`; `editor.snapshot` + snapshots on run/submit → `code_snapshots` (content in DB for MVP)
- [ ] `live/detectors/authorship.detector.ts`: large paste, typed_ratio < 0.35 on long solution, burst > 8 chars/s sustained
- [ ] Sandbox provider: `docker.sandbox.ts` (per-run container, no network, read-only rootfs, 256 MB, 1 CPU, 128 pids, wall-clock kill); `mock.sandbox.ts`
- [ ] `POST /candidate/tasks/:taskId/run` (rate limit 1 per 3 s; visible results only)
- [ ] `POST /candidate/tasks/:taskId/submit` (visible + hidden; hidden stored only; `submittedAt` → frozen; `task.frozen` event)
- [ ] Interviewer: `GET /sessions/:id/code` (snapshots, executions incl. hidden results)
- [ ] Tests: hidden results never in candidate response, run rate limit, edits rejected after submit

**Done when:** a candidate can run and submit code; the interviewer sees hidden test results; authorship observations are produced.

---

## Phase 9 — Seal and evidence verification  (FR-SEAL-1..3)

**Tasks**
- [ ] Replace Phase 5 stub with `seal.service.ts` 9-step sequence, resumable via `s:{sid}:seal`
- [ ] Recording stop via media provider (mock finalises immediately); `recordings` row
- [ ] Event log export `evidence/events.ndjson.gz` (stream, don't load all rows in memory)
- [ ] `signer` Ed25519; `manifest.json` + `manifest.sig`; `evidence_manifests` row
- [ ] Candidate `session.ended` identical thank-you payload
- [ ] `GET /sessions/:id/evidence/verify` → `{ valid, lastSeq, chainHead, signatureValid, firstBrokenSeq? }`
- [ ] On boot: resume any session stuck in SEALING
- [ ] Tests: crash mid-seal resumes; tampered observation fails verify; tampered manifest fails signature

**Done when:** ending a session produces a signed manifest that verifies, and verification detects tampering.

---

## Phase 10 — Post-processing pipeline and report  (FR-PIPE-1..3, FR-GRADE-1, FR-SCORE-1, FR-REP-1..4)

**Tasks**
- [ ] `pipeline/flow.ts` (BullMQ FlowProducer; attempts 3; `failParentOnFailure: false`) + `pipeline_runs` / `pipeline_step_runs`
- [ ] Steps: SealVerify, TranscriptFinalize (drop superseded partials, pair Q&A, back-channel turns don't open a pair, topic label — mock), IntegrityRescore (replay fusion over all observations + adjudications, set `supersededByReview`, origin OFFLINE flags), CodeEvaluate (hidden results, typed_ratio, burst rate, paste map, edit timeline; no integrity inference), MediaIndex (offset table), AnswerGrading (per pair via `llm.grade()` mock; rubric validation rejects forbidden dimensions), CompositeScore (formula in Architecture §6.9), RenderReport (eta template → HTML; PDF if enabled; methodology appendix mandatory)
- [ ] Degraded path: any FAILED step → `DEGRADED`, report `degraded = true`, `lostSteps`
- [ ] Delivery: summary email (summary only), `report.ready` via `events:{sid}`, PROCESSING → COMPLETE
- [ ] `GET /sessions/:id/report`, `GET /reports/:id/html`, `GET /reports/:id/pdf` (auth + org scope)
- [ ] `POST /sessions/:id/report/recompute` (after adjudication post-delivery)
- [ ] Tests: happy path; forced failure of one step → degraded report delivered; integrity < 70 → composite null; email contains no transcript/flag narrative

**Done when:** the PRD §8 end-to-end scenario passes.

---

## Phase 11 — Retention, hardening, docs

**Tasks**
- [ ] `retention.worker.ts` nightly: recordings/frames 90 d, raw observations 180 d (keep event log ≥ 30 d), reports/transcripts 3 y; deletion receipt in `audit_logs`
- [ ] `GET /sessions/:id/audit`
- [ ] Rate limit review, helmet/CORS review, dependency audit (without `--force`)
- [ ] Load test telemetry ingest (target: 1 session × 4 events/s × 60 min without lag)
- [ ] OpenAPI document generated from zod schemas (optional) or kept in `Design.md`
- [ ] README: setup, env, scripts, architecture links

**Done when:** retention job tested with fake dates; README lets a new developer run everything in 10 minutes.

---

## Deferred (not in this build)

- Real CV / ASR producers (ingest API is ready).
- Real LLM provider for JD parse, suggestions, grading (interface is ready).
- S3, KMS, SES providers.
- Detector calibration training from dismissed flags (data is already stored).
- Horizontal scaling of the api process (Socket.IO Redis adapter).
