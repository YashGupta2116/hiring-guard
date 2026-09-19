# Memory.md — VeriTrust Backend

> **AI: read this file first in every new chat.** Update it at the end of every task.
> Keep it short. Replace stale info instead of appending forever.
> Docs: `PRD.md` (what) · `Architecture.md` (how) · `Rules.md` (constraints) · `Phases.md` (order) · `Design.md` (API contract)

---

## Current status

- **Current phase:** Phase 11 — Retention, hardening, docs (✅ done). This was also the last phase in
  `Phases.md`; everything through Phase 11 is now built, and both bugs found in Phase 10's self-check
  are now fixed too (see Decisions log's two "Bug fix" entries).
- **Last updated:** 2026-09-18
- **Next step:** None queued in `Phases.md`. Both Phase 10 self-check bugs are fixed, and this backend
  is now containerized and verified deployable (`Dockerfile` + `docker-compose.yml`'s `app` profile,
  built and actually run end-to-end this session — see Decisions log's "Deployment" entries and
  `docs/REMAINING_WORK.md` §1/§1a). Candidates for a future session: wire the frontend to this API
  (currently 100% mock-data), or build a real CV/ASR/LLM provider (all still `Deferred`).

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
| 8 Coding round | ✅ | build + 152 tests pass; `GET /candidate/tasks`, `editor.delta`/`editor.snapshot` sockets → `editor_deltas`/`code_snapshots`, `authorship.detector.ts` (paste/typed_ratio/burst reusing PASTE/RHYTHM channels), `docker.sandbox.ts` (real per-run container) + existing `mock.sandbox.ts`, run (rate-limited)/submit (hidden results, freezes task), interviewer `GET /sessions/:id/code` |
| 9 Seal & evidence | ✅ | build + 157 tests pass; real 9-step `seal.service.ts` (Redis `s:{sid}:seal` step counter, resumable), recording start (LIVE)/stop (seal step 4) via `MediaProvider`, `evidence.service.ts` gained `verifyChain`/`exportEvidenceLog`/`buildAndSignManifest`/`verifySession`, `GET /sessions/:id/evidence/verify`, boot-time `resumeStuckSeals()` |
| 10 Pipeline & report | ✅ | build + 167 tests pass; real 8-step BullMQ pipeline (`pipeline/flow.ts` + `pipeline/steps/*`): SealVerify (own queued job, no tree-child of anything downstream reads), TranscriptFinalize (Q&A pairing, back-channel filtering, mock topic labels), IntegrityRescore (authoritative offline replay via the same pure `fusion.engine.ts` functions, adjudication-adjusted, sets `supersededByReview`), CodeEvaluate, MediaIndex (resolves the Phase 7/9 `mediaOffsetMs: null` TODO), AnswerGrading (rubric-validated via zod `.strict()`), CompositeScore (Architecture §6.9 formula, unchanged), RenderReport (`eta` → HTML, optional `puppeteer` → PDF) + delivery (summary-only email, `report.ready`, PROCESSING→COMPLETE). `GET /sessions/:id/report`, `GET /sessions/:id/pipeline`, `POST /sessions/:id/report/recompute`, `GET /reports/:id/html`, `GET /reports/:id/pdf` |
| 11 Retention & hardening | ✅ | build + 177 tests pass; `retention.service.ts` (4 windows: media+frames 90d, observations 180d hard-delete, evidence log 30d floor, reports+transcripts 3y hard-delete — each writes an `audit_logs` receipt), nightly BullMQ job (`upsertJobScheduler`, `RETENTION_CRON`) run from `npm run worker`; `GET /sessions/:id/audit` (OWNER/ADMIN only, cursor-paginated); rate-limit/helmet/CORS review (all already in place — added the missing `Retry-After` header on 429s); `npm audit` run (3 unfixable-without-`--force` findings, documented, not forced); `scripts/load-test-telemetry.ts` + `backend/README.md` |

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
│   ├── integration/app, auth, session, coding-task, join, lifecycle, session-runtime, telemetry, live,
│   │   coding
│   │   .test.ts (telemetry.test.ts is Phase 6: candidate tel.batch → chained observations, dup seq/gap
│   │   handling, internal API observations/transcript/heartbeat, producer DEGRADED → system.degraded →
│   │   recovery; live.test.ts is Phase 7: calibration gates flag creation, threshold crossing → flag →
│   │   15s merge, warden tier progression/cooldown/cap/no-template-no-warning, warn.ack latency,
│   │   adjudicate confirm/dismiss/downgrade incl. cross-org 404 and live score recovery on dismiss, notes
│   │   REST + socket, suggestions refresh + accept, candidate-boundary scan of every `/candidate` emit
│   │   across a scripted session with a real warning; coding.test.ts is Phase 8: candidate task list/run
│   │   rate limit/submit hidden-results/frozen-task, interviewer code view w/ hidden results,
│   │   editor.snapshot persistence, an editor.delta paste crossing into a real paste_large flag)
│   └── unit/                     error handler + validate, hash utils, providers, timer, detectors,
│       calibration, producer-health, fusion-engine, authorship-detector
├── src/
│   ├── index.ts                  http server, graceful shutdown, fatal handlers
│   ├── worker.ts                 BullMQ worker bootstrap (jd-parse); run with `npm run worker`
│   ├── app.ts                    requestId → pino-http → helmet → cors → json → cookies → /api/v1 (apiLimiter) → 404 → errorHandler
│   ├── config/env.ts             zod env; ONLY place that reads process.env
│   ├── config/constants.ts       JD upload caps, pagination defaults, Phase 6 telemetry/producer timings,
│   │   Phase 8 AUTHORSHIP_*/CODE_RUN_RATE_LIMIT_MS
│   ├── config/detection.ts       SERVER-ONLY: LLR_TABLE (type×sensitivity), CHANNEL_WEIGHTS,
│   │   CHANNEL_DECAY_SECONDS, CHANNEL_THRESHOLDS, FUSION_SIGMA, SEVERITY_BAND_*_MULTIPLIER,
│   │   corroboration/merge tunables — never sent to clients
│   ├── controllers/health, auth, org, candidate-directory, session, jd, coding-task, question-bank,
│   │   link, join, candidate, internal, flag .controller.ts (candidate.controller.ts gained
│   │   getTasks/runTask/submitTask in Phase 8; session.controller.ts gained getSessionCode in Phase 8
│   │   and getEvidenceVerification in Phase 9)
│   ├── routes/index.ts (mounts all routers), auth/org/candidate-directory/session/jd/coding-task/
│   │   question-bank/link/join/candidate/internal/flag .routes.ts (each router's own middleware is
│   │   mounted with an explicit path prefix, e.g. `router.use("/auth", authLimiter)` — NEVER
│   │   `router.use(mw)` with no path, since a sub-router mounted at apiRouter's root ("/") would
│   │   otherwise apply that middleware to every request; candidate.routes.ts's run-limiter is keyed by
│   │   `sessionId:taskId`, not IP, via `createRateLimiter`'s `keyGenerator`; `GET /sessions/:id/
│   │   evidence/verify` lives in session.routes.ts, same as `.../code` — no dedicated `evidence.routes.ts`
│   │   file, matching how this repo actually places session-scoped endpoints vs. Architecture.md's
│   │   aspirational tree)
│   ├── services/health, auth, org, candidate-directory, audit, session, session-state, config, jd,
│   │   coding-task, question-bank, link, join, media, candidate, evidence, internal, flag, note,
│   │   suggestion, coding, seal .service.ts (session-state.service.ts `transition()` is the ONLY place
│   │   InterviewSession.status changes: CAS via updateMany + audit log in one transaction, then
│   │   publishes events:{sid} "session.state"; evidence.service.ts `appendObservations()` is the ONLY
│   │   place that assigns seq/prevHash/hash, and Phase 9 added `verifyChain`/`exportEvidenceLog`/
│   │   `buildAndSignManifest`/`verifySession`; internal.service.ts is the CV/ASR/producer side of the
│   │   Phase 6 internal API; flag.service.ts does the org/role check itself for `/flags/:flagId/*`
│   │   instead of a dedicated middleware, since the URL has no session id to key off; suggestion.service.ts
│   │   only wires the manual `POST .../suggestions/refresh` trigger, see Known issues; coding.service.ts
│   │   is Phase 8: candidate task list/run/submit (submit does a CAS `updateMany` on `submittedAt` to
│   │   guard concurrent double-submit, then calls `runtime.freezeTask()`), interviewer getSessionCode;
│   │   seal.service.ts is Phase 9: `sealSession()` — the real 9-step sequence, numbered and resumable via
│   │   `s:{sid}:seal`'s `step` field; `resumeStuckSeals()` — called once at boot, re-runs `sealSession()`
│   │   for any session still SEALING; media.service.ts gained `startRecordingIfConfigured()`, called from
│   │   `lifecycle.service.startSession`)
│   ├── middlewares/request-id, validate (+ getInput), not-found, error-handler, rate-limit, auth
│   │   (requireUser), org-role (requireRole), session-access (requireSessionAccess — org membership +
│   │   bound-interviewer-or-privileged-role check, sets req.sessionRecord), upload (jdUpload, multer
│   │   memory), join-token (requireJoinToken — signature + live DB state: revoked/consumed/expired
│   │   checked fresh on every call, no exp claim on the JWT itself), candidate-token
│   │   (requireCandidateToken — JWT has exp = duration + 2h, loads Consent by id), service-token
│   │   (requireServiceToken — constant-time compare of INTERNAL_SERVICE_TOKEN, hashed first so unequal
│   │   lengths don't short-circuit `timingSafeEqual`)
│   ├── providers/index.ts        getStorage/getMail/getLlm/getMedia/getSandbox/getSigner (lazy singletons)
│   │   storage(local) mail(smtp|log) llm(mock) media(mock) sandbox(mock|docker, env SANDBOX_PROVIDER)
│   │   signer(ed25519)
│   ├── providers/sandbox/docker.sandbox.ts  Phase 8: real per-run container via `dockerode` — one
│   │   container executes every test case for the request (a small Python/Node harness written into the
│   │   bind-mounted temp dir loops over `tests.json`, JSON-prints per-test stdout/stderr/exitCode/timedOut),
│   │   no network, read-only rootfs + 16MB tmpfs at /tmp, 256MB/1cpu/128pids, wall-clock kill; only
│   │   python/python3/javascript/node are registered (`LANGUAGE_RUNNERS`) — anything else returns a plain
│   │   ERROR result, not a thrown exception. Reads container output via `logs({follow: true})` and
│   │   collects the stream itself — NEVER the non-stream `logs()` overload, see Decisions log for why
│   ├── workers/jd-parse.worker.ts  extracts text (pdf-parse v2 `new PDFParse({data}).getText()`, or
│   │   mammoth.extractRawText for DOCX, or rawText for TEXT) → llm.parseJd() → PARSED/FAILED
│   ├── workers/link-expiry.worker.ts  delayed BullMQ job per join link; ARMED + never consented when it
│   │   fires → transition to EXPIRED
│   ├── sockets/index.ts          Socket.IO server: /interviewer ns (access JWT in handshake.auth.token,
│   │   client emits `session.join {sessionId, lastFrameSeq?}` with ack, server checks org+binding then
│   │   joins room `session:{sid}` and replays buffered frames), /candidate ns (candidate JWT, auto-joins
│   │   its session room, drives SessionRuntime.onCandidateConnected/Disconnected; Phase 8 added
│   │   editor.delta/editor.snapshot handlers, both routed to `registry.get(sid)?.handleEditorDelta/Snapshot`)
│   ├── sockets/emitter.ts        emitToInterviewers (wraps in {frameSeq,sessionId,ts,data}, appends to
│   │   Redis `s:{sid}:buf` capped at 2000, emits) + emitToCandidate (unbuffered, allow-list only) +
│   │   replayFrom(sid, afterSeq)
│   ├── sockets/session-broadcast.ts  Phase 9: `broadcastSessionState()` (+ its `mapCandidateStatus`
│   │   helper), extracted out of `lifecycle.service.ts` so `seal.service.ts` can call it too without the
│   │   two services importing each other
│   ├── sockets/event-subscriber.ts  psubscribe("events:*") → forwards worker-published events
│   │   (utils/events.ts publishSessionEvent, e.g. jd.parsed) to emitToInterviewers
│   ├── sockets/events.ts         INTERVIEWER_EVENTS (+ SYSTEM_DEGRADED, TRANSCRIPT_PARTIAL/FINAL,
│   │   INTEGRITY_TICK, FLAG_NEW, FLAG_UPDATE, WARN_ISSUED, NOTE_ADDED, QS_SUGGESTIONS) / CANDIDATE_EVENTS
│   │   (+ WARN_SHOW, Phase 8's TASK_FROZEN) name constants + session.join, clockSync, clockOffset,
│   │   telemetryBatch, warnAck, noteAdd, Phase 8's editorDeltaSchema/editorSnapshotSchema zod schemas
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
│   │   for CONFIRM/DISMISS/DOWNGRADE (approximate — Phase 10 IntegrityRescore is the authoritative one).
│   │   Phase 8 added `handleEditorDelta()`/`handleEditorSnapshot()` (same serialized `writeQueue`,
│   │   in-memory per-sessionTask `editorSeq` dedup — same non-resume caveat as `FusionState`) and
│   │   `freezeTask()` (an in-memory `frozenTasks` Set that `coding.service.submitTask` populates so
│   │   further editor.delta/snapshot for that task are silently dropped, mirroring `FrozenChannelTracker`)
│   ├── live/registry.ts          sid -> SessionRuntime in-memory map
│   ├── live/timer.ts             computeTimerState(startedAt, durationMinutes, now) — pure, unit-tested;
│   │   per-topic budget burn still deferred (no live topic tracking yet)
│   ├── live/ingest.ts            TelemetryIngest — per-connection clock correction (offset passed in per
│   │   call, since Design.md's `clock.offset` has no connId of its own) + Redis-backed seq dedup/gap
│   │   detection (`s:{sid}:conn:{connId}:seq`, FR-TEL-1/2)
│   ├── live/calibration.ts       Baseline — collects rhythm (keystroke variance) samples during the
│   │   first 60s; RhythmDetector reads it once ready
│   ├── live/detectors/           focus, paste, pointer, env, rhythm, authorship .detector.ts — pure
│   │   classes, no I/O (Rules.md §5); ks-test.ts (two-sample KS statistic); types.ts (TelemetryEvent,
│   │   DetectorObservation, Phase 8's EditorChange). authorship.detector.ts (FR-DET-2) keys its running
│   │   typed/total char totals by sessionTaskId; emits `paste_large`/PASTE for a large editor paste
│   │   (reusing the existing type+channel), `typed_ratio_low`/RHYTHM once the solution passes
│   │   AUTHORSHIP_MIN_SOLUTION_CHARS with too little of it typed, `typing_burst`/RHYTHM for sustained
│   │   >8 chars/s — see Decisions log for why PASTE/RHYTHM instead of a new channel
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
│   │   (8 of Design.md §6's 9 types now have wording as of Phase 8's `typing_burst`; only
│   │   `SCREEN_SHARE_STOPPED` still has none — a type with none just never shows a warning, the flag
│   │   still exists); `acknowledgeWarning()` — `warn.ack` → ackLatencyMs → flag.update
│   ├── services/lifecycle.service.ts  startSession (guards: ADMITTED, !needsReconsent, Redis
│   │   mediaReady==="1"; creates+starts SessionRuntime, starts recording via
│   │   `media.startRecordingIfConfigured`, ADMITTED→LIVE), endSession (idempotent once past LIVE;
│   │   delegates the actual LIVE→SEALING→...→PROCESSING work to `seal.service.sealSession` as of Phase 9),
│   │   getLiveSnapshot (dashboard-reload hydrate: status, elapsedMs/remainingMs, mediaReady, integrity,
│   │   flags, notes, lastFrameSeq — transcriptTail/suggestions/degraded from Design.md §4.10 still not
│   │   included)
│   ├── services/flag.service.ts  listFlags (with latest warning + adjudication history per flag),
│   │   adjudicateFlag (role/binding check done here, not middleware, since `/flags/:flagId` has no
│   │   session id in the URL; nudges the live accumulator via `runtime.applyAdjudication`)
│   ├── services/note.service.ts  listNotes, addNote (mediaOffsetMs always null — no recording anchor
│   │   wired up to notes yet, even though `Recording.egressStartedAt` now exists as of Phase 9; revisit if
│   │   the dashboard wants notes anchored to media offsets)
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

**Phase 10 additions** (`src/pipeline/`, new this phase):
```
├── src/pipeline/
│   ├── flow.ts                   enqueuePipeline() (real BullMQ FlowProducer, production),
│   │   runPipelineInline() (direct sequential call, tests — see Decisions log),
│   │   processPipelineStep() (the Worker processor registered in worker.ts), deliverReport()
│   │   (email + report.ready + PROCESSING→COMPLETE, called once RENDER_REPORT succeeds)
│   ├── step-runner.ts            runStep(): every step's own pipeline_step_runs row RUNNING→SUCCEEDED|FAILED
│   └── steps/                    seal-verify, transcript-finalize, integrity-rescore, code-evaluate,
│       media-index, answer-grading, composite-score, render-report .step.ts — each exports a
│       plain compute*(sessionId) function, directly callable (no BullMQ needed) same as processJdParse
├── src/services/report.service.ts   getReport, getPipelineStatus, recomputeReport (session-scoped),
│   getReportHtml/getReportPdf (reportId-scoped, own inline org/role check — see flag.service.ts precedent)
├── src/controllers/report.controller.ts, src/routes/report.routes.ts   only the two reportId-scoped
│   endpoints; report/pipeline/recompute live in session.controller.ts/session.routes.ts instead,
│   matching how this repo already places session-scoped endpoints (evidence/verify, code, etc.)
├── src/validators/report.schema.ts, src/validators/grade.schema.ts   reportIdParamSchema,
│   gradeResultSchema (`.strict()` rubric validation — Phases.md §10)
├── templates/report.eta          HTML report template (Phase 10 introduces `templates/` — didn't exist before)
└── contracts/, docs/cross-component-architecture.md   from the earlier session this phase, unrelated to Phase 10 itself
```
New env var: `REPORT_PDF_ENABLED` (default `false`; PDF is optional, HTML is not — Architecture.md §1).
New deps: `eta`, `puppeteer` (both pre-approved, Rules.md §3).

**Phase 11 additions** (new this phase):
```
├── src/services/retention.service.ts   runRetention(now = new Date()) — `now` is injectable so
│   tests seed fixtures at fixed past offsets instead of racing real wall-clock time. Four purge
│   functions, each self-contained: purgeMedia (90d, clears Recording.compositeUri/hlsUri/checksum/
│   mediaIndex + storage.deletePrefix, row stays), purgeObservations (180d, hard `deleteMany` — the
│   append-only exception Rules.md §8 already carves out for the retention job), purgeEventLogs
│   (floor = max(observations window, 30d) — deletes only the raw ndjson event log object,
│   `EvidenceManifest.manifestUri`/signature/chainHead stay so the chain head is still verifiable
│   long after the raw log is gone), purgeReportsAndTranscripts (3y, hard-deletes `Report`/
│   `TranscriptSegment` rows + report storage objects — neither table is in the append-only set).
│   Every purge writes one `audit_logs` row per session per category (action `retention.deleted`)
├── src/workers/retention.worker.ts     processRetention() — thin wrapper, calls runRetention()
├── src/worker.ts                       registers the retention Worker + `retentionQueue.
│   upsertJobScheduler("retention-nightly", {pattern: RETENTION_CRON}, ...)` at boot — idempotent
│   by scheduler id, so a worker restart updates the existing schedule instead of duplicating it
├── src/services/audit.service.ts       gained `listForSession()` — cursor-paginated (BigInt id
│   desc, same `limit+1`/`cursor`+`skip:1` pattern as `session.service.listSessions`)
├── GET /sessions/:id/audit             OWNER/ADMIN only (`requireRole` before `requireSessionAccess`
│   — narrower than every other session-scoped GET, which also allows REVIEWER/bound INTERVIEWER;
│   Design.md §4.11 already specced this row as `U (O,A)` before this phase touched the file)
├── src/middlewares/rate-limit.ts       `handler` now sets a real `Retry-After` header (seconds) on
│   every 429 — Design.md's error table already documented one; only the JSON body carried it before
└── scripts/load-test-telemetry.ts      drives one live session's `/candidate` socket at 4 tel.batch/s
    (alternating focus blur/focus, 2000ms synthetic ts steps so every pair clears FOCUS_IGNORE_MS and
    scores exactly one Observation) against a running `npm run dev`, polling Postgres directly for
    backlog instead of trusting client-side timing. Defaults to the full 60-minute spec;
    `LOAD_TEST_DURATION_SECONDS` overrides for a smoke run
```
New env vars: `RETENTION_MEDIA_DAYS` (90), `RETENTION_OBSERVATIONS_DAYS` (180),
`RETENTION_EVIDENCE_LOG_FLOOR_DAYS` (30), `RETENTION_REPORTS_DAYS` (1095), `RETENTION_CRON`
(`0 3 * * *`). No new deps, no schema change.

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

express 5 · zod 4 · prisma/@prisma/client/@prisma/adapter-pg 7.10 · ioredis 6 · pino 10 · pino-http 11 · express-rate-limit 8 · rate-limit-redis 6 · helmet 8 · nodemailer 10 · ulid 3 · dotenv 17 · typescript 7 · tsx 4 · vitest 5 · supertest 7 · argon2 (latest) · jose (latest) · bullmq (latest) · multer (latest) · pdf-parse 2.4.5 (class-based `PDFParse` API, not the old callback/promise-of-buffer style) · mammoth (latest) · dockerode 4 + @types/dockerode 3 (Phase 8, Rules.md §3 already listed it)

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
| 2026-09-18 | Authorship detector signals (`paste_large` reused, plus new `typed_ratio_low`/`typing_burst`) are scored on the existing `PASTE`/`RHYTHM` channels, not a new channel | `MonitoringChannel` has no "authorship"/"code" value and adding one needs a schema migration (CLAUDE.md: ask first); the signals are conceptually the same kind of evidence (a disguised paste, an anomalous typing pattern) just captured from the editor instead of general telemetry, so reusing the channel/weight/threshold that already exists avoids a schema change for Phase 8 |
| 2026-09-18 | Candidate-facing `taskId` in `/candidate/tasks`, `editor.delta`, `editor.snapshot`, run/submit routes is `SessionCodingTask.id`, not `CodingTask.id` | The candidate never needs the org-level task id, and `EditorDelta`/`CodeSnapshot`/`CodeExecution` all key off `sessionTaskId` already — using the session-scoped id end-to-end avoids an extra lookup and matches what the DB actually references |
| 2026-09-18 | `editor.delta` dedup is a plain in-memory `Map<sessionTaskId, lastSeq>` on `SessionRuntime`, not a Redis-backed per-connection dedup like `TelemetryIngest` | Editor content is already durably stored as `EditorDelta` rows in Postgres (unlike telemetry, which only exists as derived `Observation`s); a duplicate/out-of-order batch here would just double-count characters in the authorship detector's running totals, not lose evidence — the same "no mid-LIVE resume exists yet" gap already accepted for `FusionState` |
| 2026-09-18 | `docker.sandbox.ts` reads container output via `container.logs({stdout:true, stderr:true, follow:true})` and manually collects the stream, never the non-`follow` `logs()` overload | Discovered live: `docker-modem`'s non-stream response path (`lib/modem.js`) does `JSON.parse(body) \|\| buffer` on *every* non-stream API response, including logs — so when a run's stdout is itself valid JSON (our harness always prints one `json.dumps(results)` line), `logs()` silently hands back the *parsed array/objects* instead of a `Buffer`, and `.toString()` on that produces `"[object Object],[object Object]"` garbage instead of the real output. Forcing the `follow: true` / stream code path in docker-modem sidesteps the auto-parse entirely. Cost real debugging time; if any other dockerode non-stream call's output could ever look like JSON, apply the same fix |
| 2026-09-18 | `docker.sandbox.ts` runs every test case for one `run`/`submit` from inside a single container (a generated harness script loops over `tests.json`), not one container per test case | Spec 7.9 says "one container per run" (singular) — read as one container per `POST .../run` or `.../submit` call, covering all of that call's test cases, not one container per test case, which would also be far slower for tasks with many tests |
| 2026-09-18 | `docker.sandbox.ts` only registers runners for `python`/`python3`/`javascript`/`node`; any other `language` value returns `{status: "ERROR", ...}` from `execute()`, not a thrown exception | `CodingTask.languages`/the run/submit `language` field are free-text strings (no enum in the schema or validators), so arbitrary values are possible; supporting genuinely arbitrary languages generically isn't practical for this phase, and the mock sandbox (still the default via `SANDBOX_PROVIDER=mock`) is what the automated test suite exercises regardless |
| 2026-09-18 | `lifecycle.service.startSession` now calls `media.startRecordingIfConfigured()` (starts egress + creates a `Recording` row when any of recordVideo/Audio/Screen is true) | No earlier phase ever started a recording, yet Phase 9's seal step 4 ("stop recording egress") only makes sense if one is already running. `Recording`/`MediaProvider.startRecording` already existed in the schema/interface purely for this. A session with all three record flags off never gets a `Recording` row, and seal's stop step is then a no-op |
| 2026-09-18 | `seal.service.sealSession()`'s Redis progress counter (`s:{sid}:seal` hash field `step`) tracks steps 2–9 only; the CAS to SEALING (step 1) is inferred from the session's own `status` instead of a separate counter value | The DB row is already the source of truth for "did the CAS happen" — a second flag for it in Redis would just be another thing that could disagree with Postgres. Steps 2 (drain)/3 (destroy runtime + emit `session.ended`)/6's live-tick are skipped entirely when `registry.get(sessionId)` is empty (real crash-resume case, no in-memory runtime survives a restart); the DB-only steps (4 recording, 5 producers, 6 close-unscored-windows, 7 export, 8 sign, 9 transition) are what a resumed seal actually depends on |
| 2026-09-18 | Seal step 5 ("detach producers") has no code of its own beyond an audit-log line | `internal.service.ts` already throws `INVALID_STATE_TRANSITION` for any producer call once `session.status !== "LIVE"` (Phase 6), so the CAS to SEALING at step 1 already rejects further producer ingest. Nothing else to detach |
| 2026-09-18 | `verifyChain()` recomputes the hash chain straight from the live `Observation` table (genesis forward, `prevHash`/`hash` recomputed per row) — it never reads back the exported `events.ndjson.gz` | The DB rows are the actual evidence; the export is a human/legal-readable copy taken at seal time. Recomputing from the DB on every `GET .../evidence/verify` call is cheap (bounded by one session's observation count) and catches both a tampered row (its own recomputed hash won't match) and a tampered *chain link* (the row after a "cleanly" re-signed tamper still points at the pre-tamper hash) — see the function's own comment for the two-case walkthrough |
| 2026-09-18 | `GET /sessions/:id/evidence/verify` checks `chain.chainHead === manifest.chainHead && chain.lastSeq === manifest.lastSeq` in addition to `chain.valid`, and separately checks the signature against the actual bytes of `manifest.json`/`manifest.sig` in storage (not a recomputation from the DB) | The head/lastSeq check catches a row being deleted or added *after* sealing even if every remaining row is internally self-consistent. Checking the signature against the real stored files (not a DB reconstruction of what the manifest "should" say) is what actually proves the on-disk evidence bundle hasn't been edited since signing — reconstructing and re-signing in memory would just test itself |
| 2026-09-18 | `manifest.sig`'s storage key is derived from `manifest.manifestUri` by replacing `.json` with `.sig`, rather than adding a `sigUri` column to `EvidenceManifest` | Architecture.md's storage layout fixes `manifest.json`/`manifest.sig` as siblings with those exact names; deriving the second path avoids a schema change (CLAUDE.md: ask before touching `schema.prisma`) for a value that's always mechanically derivable from the first |
| 2026-09-18 | The manifest only supports one active signing key at verify time (`manifest.signingKeyId !== getSigner().keyId` ⇒ `signatureValid: false`, no historical-key lookup) | No key-rotation store exists anywhere in this codebase (`EVIDENCE_SIGNING_KEY_ID` is a single env value); this phase doesn't add one either. Revisit if a real deployment needs to keep verifying sessions sealed under a since-rotated key |
| 2026-09-18 | `detectorVersions`/`weightsVersion` in the manifest reuse the existing `DETECTOR_VERSION`/`WEIGHTS_VERSION` constants from `config/detection.ts` (`{ all: DETECTOR_VERSION }`) rather than a per-detector version map | Those constants already existed pre-Phase-9 as single global tags (not per-detector granularity) — Design.md's "detector versions, weights version" is satisfied by what's actually tracked; inventing per-detector versioning nobody asked for would be unused complexity |
| 2026-09-18 | The evidence export (`exportEvidenceLog`) streams and gzips observations/flags/transcript/notes/executions via a k-way merge of five cursor-paginated (500-row batch) Prisma queries, ordered by each record's own timestamp | Phases.md explicitly says "stream, don't load all rows in memory"; keyset pagination across five differently-typed primary keys was more complexity than the actual row counts for one interview justify, so offset pagination in bounded batches was used instead — still never holds more than one batch per source in memory |
| 2026-09-18 | `readable.pipe(gzip)` in `exportEvidenceLog` has an explicit `source.on("error", err => gzip.destroy(err))` | `.pipe()` doesn't forward the source's `'error'` event to the destination by default (a well-known Node gotcha) — without this, a failed mid-stream Prisma query would leave the gzip stream (and `storage.put`'s write) hanging instead of the whole export promise rejecting so seal step 7 can fail cleanly |
| 2026-09-18 | If `verifyChain()` finds a broken chain during seal step 7 (before anything is signed), `sealSession()` throws and the session transitions `SEALING → ABORTED` instead of sealing anyway | Signing and shipping a manifest over evidence that's already inconsistent would defeat the entire point of the manifest; this should only ever happen from a bug or direct DB tampering between LIVE and seal, and the state table already allows `SEALING → ABORTED` on a fatal error |
| 2026-09-18 | Pipeline flow enqueue (seal step 9's last clause) is not implemented — `PROCESSING` has no automatic follow-up | The BullMQ `FlowProducer` and every pipeline step are Phase 10 work (Phases.md/Architecture.md §6.8); a session just stays in `PROCESSING` until Phase 10 exists. Noted as a one-line comment in `seal.service.ts`, not a silent TODO |
| 2026-09-18 | `tests/setup.ts` sets a fixed, hardcoded Ed25519 test keypair (`EVIDENCE_SIGNING_PRIVATE_KEY`/`_KEY_ID`) via `??=`, same pattern as the other test secrets already there | `getSigner()` throws without a key; `.env.test` deliberately doesn't set one (same reason the other secrets live in `tests/setup.ts` instead of a committed `.env.test`, per its own header comment). The key is test-only and not sensitive — no different from the other hardcoded test secrets already in that file |
| 2026-09-18 | Cross-component review of `backend/` vs `ml/` (a separate, non-integrated Python fusion engine): confirmed `backend/src/live/` stays the canonical live scorer — see `../../docs/cross-component-architecture.md` for the full reasoning. No constant in `config/detection.ts` changed. Added `getUnknownDetectorTypeCounts()` and a log-once-per-type warning inside `getLlr()`, which used to return `0` silently for any unrecognised `type` string — the exact failure mode a mismatched producer (a CV/ASR service, or any future `ml/` integration, whose detector vocabulary is disjoint from `LLR_TABLE`'s, see the contract file below) would hit today with no error and a permanently-clean-looking score. Added `contracts/detector-registry.json` (repo root) as the shared record of both components' channel/detector vocabularies, and `tests/unit/detection-contract.test.ts` to catch it drifting from `LLR_TABLE`/`MonitoringChannel` | The "no ML" decision above (2026-09-17) is about backend scope, not about `ml/` not existing — it does, as a sibling component, and the two had zero shared documentation until this session |
| 2026-09-18 | **Phase 10.** `technical` = mean(`correctness`,`depth`,`handsOn`) per `AnswerGrade`, averaged across pairs, blended 50/50 with `CodeEvaluation`'s hidden-test pass rate when a coding round exists (falls back to whichever input exists if only one does). `communication` = mean(`structure`,`specificity`) per pair, averaged across pairs | Architecture.md §6.9 assigns `structure`+`specificity` to communication explicitly but never says which of the other three dimensions feed `technical`, nor the code/grade blend weight. `correctness`/`depth`/`handsOn` is the natural remainder once communication's two are claimed; 50/50 is a plain average, not favouring either signal without a reason to. The top-level composite formula itself (0.55/0.20/0.25, the I-band logic) is untouched — this only fills in what "weighted mean of answer grades + code evaluation" means numerically |
| 2026-09-18 | **Phase 10.** `reviewRequired = true, composite = null` for *any* missing input (IntegrityRescore failed, or no Q&A pairs at all — e.g. a pure coding screen), not just `integrity < 70` | The formula's own branches (Architecture §6.9) only name the `I < 70` case. A missing input isn't that case, but lands at the same place the spec already defines for "can't stand behind a number" — never a guessed or partial composite |
| 2026-09-18 | **Phase 10.** `pipeline/flow.ts`: `SealVerify` runs as its own independently-queued BullMQ job (real `attempts:3`/backoff), not as a node inside the `FlowProducer` tree. The other 7 steps are a real tree: `RenderReport -> {CompositeScore -> {AnswerGrading -> TranscriptFinalize, CodeEvaluate, IntegrityRescore}, MediaIndex}` | The true dependency graph is a DAG — SealVerify's completion (in spirit) precedes 4 different steps, but nothing downstream actually *reads* its output (every step re-queries Postgres for what it needs, never a BullMQ child value — see `step-runner.ts`), and `FlowProducer` only models trees (a job can't be the shared child of two different parents without BullMQ instantiating it twice). Running it as an independent job sidesteps the tree constraint honestly instead of duplicating it 4x or faking the ordering |
| 2026-09-18 | **Phase 10.** `IntegrityRescore` replays every observation through the exact same pure functions in `live/fusion/fusion.engine.ts` (no fork), in `seq` order, excluding an observation if its channel was inside an `UnscoredWindow` at its own `ts` (mirrors `session-runtime.ts`'s live frozen-channel skip) and zeroing/halving an observation's LLR if it's linked to a DISMISSED/DOWNGRADED flag. Calibration-window observations still accumulate (only flag emission is gated), matching live exactly | `flag.service.ts`'s live adjudicate nudge already says "Phase 10's IntegrityRescore is the authoritative recompute" — this is that recompute. Skipping the frozen-window exclusion would silently un-freeze evidence live deliberately never scored (Rules.md: "no disconnection, drop or gap ever produces a positive LLR"). Matching live's calibration behaviour (not ml/'s stricter one — see `cross-component-architecture.md`) keeps the rescore an authoritative replay of *this* engine, not a quiet adoption of the other one's rule |
| 2026-09-18 | **Phase 10.** A flag is marked `supersededByReview = true` iff it has at least one `FlagAdjudication`, regardless of which action (CONFIRM/DISMISS/DOWNGRADE) | Most literal reading of the field name: a human review event is what supersedes the raw live computation for that flag. `origin: OFFLINE` flag creation is implemented and tested (`IntegrityRescore` creates one when a replay finds a crossing no existing flag already covers), but under today's inputs — adjudication only ever removes evidence — a replay with the same observations can't produce a crossing live didn't already find, so this path doesn't fire in practice yet; it's real and ready for when a fitted detector or a second replay pass makes it possible |
| 2026-09-18 | **Phase 10.** `MediaIndex` resolves the `mediaOffsetMs: null` TODO left in Phase 7/9 (`note.service.ts`'s own comment: "needs the recording's `egressStartedAt` anchor... which doesn't exist until Phase 9") — computes every flag's and note's offset from `Recording.egressStartedAt` and writes a consolidated marker table to `Recording.mediaIndex` | The anchor now always exists by the time this step runs (seal always finalises the recording first); this was a deferred computation waiting for exactly this phase, not a new design |
| 2026-09-18 | **Phase 10.** `POST /sessions/:id/report/recompute` calls `enqueuePipeline` (real queue, 202 semantics) and re-runs the *whole* pipeline, not just IntegrityRescore+CompositeScore; the summary email is only sent on the run that actually transitions `PROCESSING -> COMPLETE`, never again on a later recompute | Every step already upserts/replaces its own rows, so a full re-run costs nothing extra and keeps this to one code path instead of a second partial-pipeline one. Re-sending the identical summary email on every recompute would be spam nobody asked for; `report.ready` still fires each time so a dashboard can refresh |
| 2026-09-18 | **Phase 10.** Tests call `runPipelineInline()` (`pipeline/flow.ts`) — every step run synchronously, in dependency order, no BullMQ queue involved — instead of driving the real `enqueuePipeline()` + a worker process | Same precedent `tests/integration/session.test.ts` already set for `processJdParse`: call the processor directly rather than spin up a real worker in-process. `enqueuePipeline()` itself is exercised implicitly (seal.service.ts step 9 calls it on every `POST .../end` in the existing seal/session tests, which still pass), just not awaited to completion anywhere |
| 2026-09-18 | **Phase 10.** `tests/integration/pipeline.test.ts`'s email assertion reads `(getMail() as LogMailProvider).sent` in-memory, not a real mailbox | `tests/setup.ts` forces `MAIL_PROVIDER=log` in every test run (so no SMTP server is required); `LogMailProvider` already keeps every sent message in memory for exactly this purpose. A first attempt tried asserting against the mailpit HTTP API directly and got zero messages for this reason — not a bug in the pipeline, a mismatch with how mail is configured under test |
| 2026-09-18 | **Phase 11.** Retention keeps the `Recording` row and clears only its media pointers (`compositeUri`/`hlsUri`/`checksum`/`mediaIndex` → null); `Observation`/`Report`/`TranscriptSegment` are hard-deleted outright | `Recording` isn't in Rules.md's append-only set either way, but the row's non-media fields (`egressId`, timestamps, `status`) are cheap provenance an audit-log reader can still point to ("a recording existed, here's when"); `Observation` is explicitly named in the append-only *exception* ("except the retention job"), and `Report`/`TranscriptSegment` aren't append-only at all, so hard-deleting them needed no special sanction |
| 2026-09-18 | **Phase 11.** Evidence-log purge deletes only `EvidenceManifest.eventLogUri`'s storage object; `manifestUri`, `signature`, `chainHead`, `lastSeq` all stay in the DB row untouched, forever | Phases.md ties the log to the observations window but floors it at 30 days independently — read as: the *raw* replay-able log can go, but the signed proof that a chain existed and where it ended must remain checkable for the full report-retention window (3y), otherwise a report outliving its own evidence log would have no way to show the report wasn't fabricated after the fact |
| 2026-09-18 | **Phase 11.** `worker.ts` schedules the nightly retention job via BullMQ's `upsertJobScheduler`, not `queue.add(..., {repeat})` | This installed BullMQ version (6.3.6) removed inline `repeat` from `JobsOptions` in favour of `upsertJobScheduler` (a `tsc` error caught this immediately) — it's also strictly better here: it's idempotent by scheduler id, so restarting `npm run worker` updates the existing nightly schedule instead of registering a second one |
| 2026-09-18 | **Phase 11.** `GET /sessions/:id/audit` uses `requireRole("OWNER","ADMIN")` *before* `requireSessionAccess()`, unlike every other session-scoped GET in this file (which allow REVIEWER and a bound INTERVIEWER too) | Design.md §4.11 already specced this endpoint as `U (O,A)` — narrower than the report/pipeline/evidence rows' `U (O,A,R,I)` — before this phase touched the file, presumably because audit entries can carry other users' actorIds/metadata that a bound interviewer or reviewer shouldn't see. Ordering `requireRole` first also means a non-O/A caller gets 403 without a DB lookup revealing whether the session even exists |
| 2026-09-18 | **Phase 11.** Added a `Retry-After` response header (seconds, from the limiter's own `windowMs`) in `rate-limit.ts`'s 429 handler | Design.md's error table already documented `429 \| rate limited (Retry-After header)` — the header was never actually being set, only `retryAfterMs` inside the JSON error body. Found while reviewing rate-limit config for Phase 11's security-review checklist item |
| 2026-09-18 | **Phase 11.** `npm audit` findings (deepmerge-ts/mysql2 via `@prisma/config`→`prisma` CLI; uuid via `dockerode`) were left unfixed, not force-fixed | All three fixes npm proposes require `npm audit fix --force` (a downgrade to `prisma@6.19.3`, or a dockerode major bump) — both explicitly forbidden (Rules.md/CLAUDE.md: never `--force`, never move off Prisma 7). All three are dev-tooling-only (prisma CLI's MySQL/config-merge code paths, never touched — this app only uses `pg`) or gated behind the optional `SANDBOX_PROVIDER=docker` path, not exposed to any request handler |
| 2026-09-18 | **Phase 11.** `scripts/load-test-telemetry.ts` measures backlog by polling `prisma.observation.count()` directly from an external script, not by adding new instrumentation to `SessionRuntime` | `handleTelemetryBatch` already funnels every write through one serialized `writeQueue` per session (Phase 6/7 decisions above) with no exposed queue-depth metric; querying Postgres for "how many of what I sent has actually landed" is an honest end-to-end measurement of exactly the thing Phases.md's target cares about, without adding a metrics endpoint nobody else asked for |
| 2026-09-18 | **Bug fix.** `integrity-rescore.step.ts` now projects final decay to `(session.endedAt ?? new Date()).getTime()`, not `Date.now()` | This was the Phase 10 self-check's first unfixed bug: decaying to wall-clock run time made the "authoritative" rescored score depend on how long the pipeline job sat queued, or how late a recompute ran — not reproducible. `session.endedAt` is already set on LIVE→SEALING (`session-state.service.ts`) and is exactly "the instant this session's evidence stopped", which is what decay should be measured to. Regression test in `pipeline.test.ts` calls `computeIntegrityRescore` twice with `vi.setSystemTime()` advancing 10 real minutes between calls and asserts the score is bit-for-bit identical — confirmed this fails on the old code (99.4 vs 95.6) and passes on the fix |
| 2026-09-18 | **Bug fix.** `pipeline/flow.ts`'s `RENDER_REPORT` case now calls `deliverReport()` from a `catch` block when `isLastAttempt` is true, in addition to the existing success-path call | This was the Phase 10 self-check's second unfixed bug: `runStep` re-throwing on a `computeRenderReport` failure meant `deliverReport` — the only place that sets `PipelineRun.status` and transitions PROCESSING→COMPLETE — never ran, since RENDER_REPORT is the flow tree's root with nothing downstream of it. `isLastAttempt` (computed in `processPipelineStep` from `job.attemptsMade + 1 >= job.opts.attempts`, mirroring BullMQ's own `Job.shouldRetryJob` check; always `true` for the no-retry `runPipelineInline` test path) exists specifically so an *intermediate* failed attempt that BullMQ will still retry doesn't prematurely mark the run DEGRADED/COMPLETE and send the summary email before a later retry gets a chance to actually succeed — only the truly-exhausted final attempt falls back to delivering degraded. Regression test forces `getStorage().put` to reject once via `vi.spyOn` and confirms the session still reaches COMPLETE/DEGRADED instead of staying stuck in PROCESSING; confirmed this fails on the old code |
| 2026-09-18 | **Deployment.** Added `Dockerfile` (multi-stage: `deps`/`build`/`prod-deps`/`runtime`) and `docker-compose.yml`'s opt-in `app` profile (`migrate`/`api`/`worker` services), both new this session | User asked to "complete anything left for deployment, so there are no issues deploying" — no Dockerfile existed at all before this; `docker-compose.yml` only ever ran infra (Postgres/Redis/mailpit), never the app itself. Actually built and ran the full containerized stack end-to-end (not just written and assumed correct) — see the two bugs it caught, below |
| 2026-09-18 | **Deployment.** `Dockerfile`'s `build` stage sets a placeholder `DATABASE_URL` before `RUN npm run build` | `prisma.config.ts` calls `env("DATABASE_URL")` eagerly, so `prisma generate` (which only introspects `schema.prisma` and never actually connects) still fails to even load its config without *some* resolvable value present at build time. The placeholder is build-stage-only — the final `runtime` stage gets its real `DATABASE_URL` from the environment at container start, same as every other secret |
| 2026-09-18 | **Deployment.** The `migrate` compose service targets the Dockerfile's `build` stage, not the final `runtime` image | `prisma` (the CLI, needed for `migrate deploy`) is a devDependency; the `runtime` stage is deliberately `npm ci --omit=dev` to keep the deployed image lean, so it doesn't have the CLI. `build` still has the full source tree and dev deps, so it's what actually runs the one-off migration job |
| 2026-09-18 | **Deployment bug, found and fixed.** `logger.ts` now falls back to plain JSON logging if the `pino-pretty` transport can't be loaded, instead of letting `pino()` throw | The Docker smoke test reproduced a real crash: `docker-compose.yml`'s local-only `app` profile injects the developer's own `.env` (`NODE_ENV=development`) via `env_file`, so `isProduction` was false and `logger.ts` tried to load `pino-pretty` — a devDependency absent from the `runtime` image's `node_modules` (`npm ci --omit=dev`) — and `pino()` threw `"unable to determine transport target"` synchronously, taking the whole process down before it logged a single line. Fixed at two layers: `docker-compose.yml`'s `app` profile now explicitly forces `NODE_ENV: production` (documented in README as required for any real deployment too), **and** `logger.ts` itself now wraps the pretty-transport attempt in try/catch so a forgotten/misconfigured `NODE_ENV` degrades to unformatted-but-working logs instead of crash-looping the container. Verified the fallback directly: ran the built image with `NODE_ENV=development` and confirmed it logs instead of throwing |
| 2026-09-18 | **Deployment bug, found and fixed.** `docker-compose.yml`'s `worker` service explicitly sets `healthcheck: disable: true` | The `Dockerfile`'s `HEALTHCHECK` probes the API's `GET /api/v1/ready` over HTTP; `worker.js` never opens a port, so that inherited check would report the worker container permanently unhealthy. Caught because `docker compose ps` showed `worker` stuck on "health: starting" after `api` was already "healthy" |
| 2026-09-18 | **Deployment.** `worker.ts`'s shutdown handler rebuilt to match `index.ts`'s: guarded against double-invocation, a 10s force-kill fallback, and now disconnects Prisma/Redis before exiting; also now handles `unhandledRejection`/`uncaughtException` (previously only `SIGTERM`/`SIGINT`, and just `process.exit(0)` with no disconnect or timeout) | The two processes had drifted to different robustness levels since `index.ts`'s pattern was written in an earlier phase; an orchestrator's rolling restart sends `SIGTERM` to both, and the worker deserves the same clean-drain guarantee the API already had before this goes anywhere real |
| 2026-09-18 | **Cleanup.** Deleted `pnpm-lock.yaml`/`pnpm-workspace.yaml` (untracked, appeared unexplained during an earlier session on this same day) and did a clean `rm -rf node_modules && npm install` | `node_modules/.pnpm` existed — something had run a real `pnpm install` against this npm-only project (Rules.md §3 doesn't list pnpm at all) at some point, leaving a hybrid npm/pnpm `node_modules` that happened to still pass typecheck/test/build but is exactly the kind of drift that causes "works here, breaks in CI" surprises, and a stray lockfile is itself a deployment risk on any platform that auto-detects the package manager from whichever lockfile is present. The Docker image build was already unaffected either way (it only ever copies `package.json`/`package-lock.json` into a fresh `npm ci`), but the host environment needed the same guarantee |

---

## Environment notes

- Machine: macOS arm64, Node v25.6.1 (package `engines` says >=22; switch to LTS if odd issues appear)
- Run everything from `backend/`. Prisma via local `npx prisma` only (never `@latest`). Never `npm audit fix --force`.
- Local services: `docker compose up -d` (or native Postgres/Redis on default ports)

## Known issues / open questions

- **Phase 10, resolved for local dev/test.** Nothing here starts `npm run worker` automatically the way `docker compose up` starts Postgres/Redis — still true for the plain host workflow. For a real deployment this is now resolved: `Dockerfile` + `docker-compose.yml`'s `app` profile define `worker` as its own long-lived service, actually run and driven through a real session this session (see Decisions log's "Dockerfile + deployment" entry). Tests still sidestep this with `runPipelineInline()`.
- **Phase 10.** `PDF_ENABLED=false` by default; `npm install` still downloaded puppeteer's Chromium (~300MB) since REPORT_PDF_ENABLED is only checked at render time, not install time. No way around this while `puppeteer` (not `puppeteer-core`) is the Rules.md §3-approved package; revisit if install size becomes a problem.
- **Phase 10.** Backend's live engine accumulates LLR through the calibration window and only gates flag *emission* (`session-runtime.ts`); `ml/`'s engine gates accumulation too (corrected there as an explicit bug fix, per `ml/docs/Memory.md`). `IntegrityRescore` intentionally matches backend's own live behaviour, not ml/'s — see Decisions log and `docs/cross-component-architecture.md`. Not fixed here since it's a fusion-constant-adjacent behaviour change that needs asking first, same as any other `config/detection.ts`-adjacent change.
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
- Join window (resolved): a candidate can open the waiting room from `JOIN_EARLY_MINUTES` (15, constants.ts)
  before `scheduledAt`, or from the link's `notBefore` if later. `GET /join/:token` still answers (status
  `NOT_YET_OPEN` plus `opensAt`) so the page can say when; preflight, policy and consent are refused with
  `INTERVIEW_NOT_OPEN` (403) until then, and `startSession` applies the same check. Sessions with no
  `scheduledAt` (direct links) are unrestricted. Nothing stops the interviewer being late or the candidate
  joining after the start; that is bounded only by the link's `expiresAt`.
- Changing a session's candidate (`PATCH /sessions/:id` with `candidateEmail`) revokes every unrevoked link
  for that session, since they were issued for the previous candidate. `POST /sessions/:id/links` is allowed
  from CONFIGURED or ARMED so a replacement link can be issued (the status stays ARMED).
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
- `sockets/index.ts`'s `note.add` handler picks the first room starting with `session:` out of
  `socket.rooms` — correct today because an interviewer socket only ever joins one session room via
  `session.join`, but would misbehave if that ever changes to support multiple concurrent sessions per socket.
- `suggestion.service.refreshSuggestions` and `GET /sessions/:id/live` gaps: see Decisions log (manual
  trigger only; hydrate missing transcriptTail/suggestions/degraded).
- Phase 7's fusion state lives only in `SessionRuntime` memory, not Redis (see Decisions log) — a process
  crash/restart mid-LIVE loses the live accumulator (all raw observations are still safely in Postgres, so
  Phase 10's `IntegrityRescore` is unaffected; only the *live* dashboard score would reset to 100 until new
  evidence arrives). No worse than every other mid-LIVE state SessionRuntime already can't resume.
- Warden now has templates for 8 of 9 Design.md §6 types (Phase 8 added `typing_burst`); only
  `SCREEN_SHARE_STOPPED` still has none — still blocked on the same LiveKit webhook gap as media grace.
- `typed_ratio_low` (the authorship detector's third signal) has no candidate-facing warden template —
  Design.md §6's 9-row table doesn't include one for it, only for `TYPING_BURST`, so a low typed_ratio
  produces a dashboard flag but never a `warn.show`. This is intentional, not a gap.
- `docker.sandbox.ts` is real and wired (`SANDBOX_PROVIDER=docker`) but not exercised by the automated test
  suite — `.env.test` leaves `SANDBOX_PROVIDER` unset so it defaults to `mock`, matching Rules.md's "keep
  mocks realistic and deterministic so the whole flow can be demoed without... Docker". It was manually
  smoke-tested against a real local Docker daemon (see Decisions log for the `logs()` bug that fix found).
  Only `python`/`python3`/`javascript`/`node` are supported languages; anything else is a clean `ERROR`
  result, not a crash.
- `docker.sandbox.ts`'s per-test wall-clock enforcement is inside the generated harness (Python
  `subprocess.run(..., timeout=)` / Node `spawnSync(..., timeout:)`), not the container's own cgroup —
  the container-level kill in `runContainer()` is a second, looser backstop (`timeLimitMs * 20 + 10s`) in
  case the harness process itself hangs. A test that spawns something the harness can't kill (e.g. it
  ignores SIGTERM) would only be caught by that outer container-kill.
- Coding-round REST writes (`coding.service.ts` run/submit) go straight through Prisma, not through
  `SessionRuntime`'s serialized `writeQueue` — unlike editor.delta/snapshot. This is fine because they
  don't touch the evidence hash chain or fusion state (the two things the queue actually serializes), and
  submit's freeze is guarded by its own CAS (`updateMany` on `submittedAt`), not the queue.
- `sealSession()` has no lock against being invoked twice concurrently for the same session (e.g. an
  interviewer's `POST /end` racing a boot-time `resumeStuckSeals()` in the unlikely case of a restart at
  the exact same moment). Each individual step is either a DB-level CAS (`transition()`) or naturally
  idempotent (upserts, "already READY/FAILED" checks), so a race would mostly just do some duplicate work,
  not corrupt state — but it isn't guarded the way the fusion lease guards concurrent LIVE writers.
- `EvidenceManifest` only supports a single active signing key at verify time — no historical-key store
  exists if `EVIDENCE_SIGNING_KEY_ID` is ever rotated (see Decisions log). A session sealed under a
  since-rotated key would fail `GET .../evidence/verify` with `signatureValid: false`, indistinguishable
  from real tampering.
- Recording finalize failure just marks `Recording.status = FAILED` and continues (per spec); nothing
  surfaces that failure to the interviewer/report beyond the DB row itself — Phase 10's `MediaIndex` step
  or the report's `degraded`/`lostSteps` fields would be the natural place to surface it later.
- **Phase 11.** The 60-minute/4-events-per-second load-test target (Phases.md §11) was only run as a
  5-minute smoke test in this session (`LOAD_TEST_DURATION_SECONDS=300`), not the literal full hour —
  zero backlog throughout. `scripts/load-test-telemetry.ts` defaults to the full spec; run it
  unattended (or via `nohup`) for a real hour-long sign-off before treating this item as fully verified
  in a specific deployment environment.
- **Phase 11.** Retention windows key off `InterviewSession.endedAt`/`Recording.endedAt`/
  `EvidenceManifest.sealedAt` — a session that never reaches `endedAt` (e.g. stuck `ABORTED` before any
  `endReason` timestamp is set, or a pre-existing row from before this phase with `endedAt: null`) is
  never selected by any purge query and will never be retention-swept. Not currently possible for a
  normal session (every terminal state sets `endedAt` — see `timestampFieldsFor()` in
  `session-state.service.ts`), but worth checking if a future status ever skips it.
- **2026-09-19, found, not fixed (for the teammate).** The calibration boundary comes from arrival
  time, not observation time. `session-runtime.ts:198` (`applyFusionAndFlags`) and `:263`
  (`processTelemetryBatch`) each compute `calibrating` once per batch as `this.isCalibrating(Date.now())`.
  An observation stamped inside the window but processed after it counts as post-window. At `:263` a
  `keystroke_stats` event in that position skips the rhythm baseline and reaches the rhythm detector.
  Replaying stored observations after the window has closed treats every one as post-window, so the
  result depends on when the code runs. `IntegrityRescore` (`integrity-rescore.step.ts:111`) and the ML
  engine (`ml/src/vtml/fusion/engine.py:161`) both read each observation's own timestamp, so live and
  rescore can disagree about an observation near the boundary today. Today the effect is limited to
  flag gating. If the accumulation change in the 2026-09-19 entry ships, this boundary decides whether
  evidence counts at all, so fix both together: compare `row.ts.getTime()` with
  `this.calibrationEndsAt.getTime()` per row at `:198`, and test each event's `correctedTs` at `:263`.

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

### 2026-09-19: getLlr unknown-type fix; calibration window diagnosed, not changed
- Phase: 11 follow-up (two defects from the backend handoff; no new phase work)
- Built: `getLlr()` in `src/config/detection.ts` returns `null` for a detector `type` with no `LLR_TABLE`
  row. It returned `0`. Known types return the same numbers as before, and no table row, weight,
  threshold or band changed. The log-once warning and the per-type counter stay.
- Files: `src/config/detection.ts`, `tests/unit/detection-contract.test.ts`; docs:
  `backend/docs/Memory.md`, `docs/cross-component-architecture.md`
- Schema/migrations: none
- New env vars: none
- Tests: unit suite 9 files, 68 tests, all passing before and after the change; `npm run typecheck`
  clean before and after. The 17 integration files did not run: this machine has no Postgres, Redis or
  Docker. Run them where the stack lives before recording.
- Decisions: `null`, not a throw and not an `UnscoredWindow` (below); the calibration change waits
  (below). Both go in the Decisions log if they stand.
- Issues left: the calibration window still accumulates evidence, and its boundary still uses arrival
  time (Known issues, 2026-09-19).
- Next: run the integration suite on a machine with Postgres and Redis; decide the calibration change
  after submission.

**Why `null` for an unknown type**
- `Observation.llr` is `Float?` (`prisma/schema.prisma:566`) and `PendingObservation.llr` is
  `number | null` (`evidence.service.ts:19`). The three callers pass the value straight into the row,
  so none changed: `session-runtime.ts:288`, `session-runtime.ts:349`, `internal.service.ts:44`.
- Live fusion skips a null row (`session-runtime.ts:201`) and so does `IntegrityRescore`
  (`integrity-rescore.step.ts:98`). The row stays in the hash chain, because `llr` is not hashed
  (`evidence.service.ts:53-64`), and it exports with `llr: null`.
- A throw is unsafe on the CV path. `internal.schema.ts:15` accepts any non-empty `type`, and
  `internal.service.ts:38-46` builds every entry of a request in one `map`. One unknown type would
  fail the whole request with a 500 (`error-handler.ts:73-74`) and drop the valid observations beside
  it, and a producer that retries would resend the same batch. At `session-runtime.ts:288` a throw
  would drop every observation in a telemetry batch after `acceptBatch` had accepted it. At `:349` the
  loss would be permanent, because the editor sequence number is already recorded (`:324`).
- An `UnscoredWindow` needs an async database write from a synchronous lookup. `SIGNAL_LOSS` also
  records lost input, so it would mislabel a vocabulary mismatch in the report.
- Limit: the null row, one log line per type and `getUnknownDetectorTypeCounts()` are the only traces.
  No code in `src/` reads the counter and the dashboard shows nothing. A caller-side `UnscoredWindow`
  write is the upgrade if that is not enough.
- This supersedes the 2026-09-18 Decisions-log entry on `getLlr` (about line 357), which says the
  return value did not change. It returned `0`, so the observation still scored as clean.

**Calibration window: diagnosis, nothing applied**
- Today: `applyFusionAndFlags` (`session-runtime.ts:197-228`) calls `applyObservation` at `:205` for
  every non-frozen row, then skips flags and the warden with `if (calibrating) continue;` at `:208`.
  Evidence from the first 60 s (200 ms under `NODE_ENV=test`, `constants.ts:31`) adds to the channel
  accumulators, sets the corroboration timestamp and moves the score. It decays with a τ of 180-300 s
  (`CHANNEL_DECAY_SECONDS`), so it keeps counting after the window closes.
- This was deliberate: Known issues (Phase 10), the 2026-09-18 IntegrityRescore decision and
  `REMAINING_WORK.md` section 4 all record it. The backend spec asks only for no flags and no warnings
  (`PRD.md` FR-LIVE-2, `Architecture.md` line 389, `Rules.md` line 179). Two other places promise
  more: the live dashboard tells the interviewer "nothing is scored" during the window
  (`frontend/components/live-interview/candidate-panel.tsx:119`), and the ML lab treats the window as
  a hard boundary for evidence.
- ML reference, `ml/src/vtml/fusion/engine.py:150-169`: an observation inside the window feeds the
  baseline builder and returns. It never reaches `state.add()`, so it adds no LLR and cannot
  corroborate a later observation. The window test reads the observation's own `t_ms`.
- Boundary sites in the backend: `session-runtime.ts:103` (`calibrationEndsAt`), `:128-130`
  (`isCalibrating`), used at `:179` (tick flag), `:198` (flag gate) and `:263` (baseline routing);
  `lifecycle.service.ts:102` (snapshot flag); offline at `integrity-rescore.step.ts:59` and `:111`.
- Accumulation (`:205-206`) and gating (`:208`) are adjacent statements, so they separate. No
  constant, weight, threshold or band moves.

Proposed diff, a sketch and not a patch. Two sites, so live and the authoritative rescore keep agreeing
(the 2026-09-18 IntegrityRescore decision requires it):

```diff
--- a/backend/src/live/session-runtime.ts  (applyFusionAndFlags)
       if (!this.enabledChannels.has(row.channel) || this.frozenChannels.isFrozen(row.channel) || row.llr === null) continue;
+      if (calibrating) continue; // observe-only: no LLR, no corroboration state

       const prevState = this.fusionState;
       const tsMs = row.ts.getTime();
       const result = applyObservation(prevState, row.channel, row.llr, tsMs);
       this.fusionState = result.state;

-      if (calibrating) continue;
-
       const { scoreDelta } = computeIntegrityDelta(...);
```

```diff
--- a/backend/src/pipeline/steps/integrity-rescore.step.ts  (replay loop, after the null/frozen skip)
+    if (obs.ts.getTime() < calibrationEndsMs) continue; // observe-only, matches live
+
     const fraction = keepFraction.get(obs.id) ?? 1;
     ...
     observationsApplied++;

-    if (tsMs < calibrationEndsMs) continue; // calibration: accumulate (matches live), never flag
```

Two comments change with it: the `applyFusionAndFlags` doc comment (`session-runtime.ts:196`) and the
"Calibration-window observations still accumulate" paragraph in the rescore docstring
(`integrity-rescore.step.ts:43-45`).

Effect:
- Inside the window the score reads 100 and every channel contribution reads 0 (`emitIntegrityTick`,
  `lifecycle.service.ts:102`).
- After the window, no in-window evidence decays into the score, so an honest session scores higher
  for its first minutes. The ML lab measured the leak at 1.17 points on `honest_seed7` (94.28 without
  it, 93.11 with it) and 0.42 on `staged_seed7` (2.35 against 1.93), `ml/docs/Memory.md:143`. Those
  runs use the ML score function, so the size on the backend is unmeasured.

Tests, from reading them; none ran here:
- No test asserts that in-window evidence accumulates.
- `live.test.ts:153-165` ("creates no flag during calibration even when the accumulator would cross")
  still passes, and its title goes stale because nothing accumulates.
- The flag tests I read in `live.test.ts` call `waitPastCalibration()` before sending telemetry
  (lines 171, 203, 377); line 458 also calls it and I did not read past it. `coding.test.ts:282` waits
  250 ms.
- If the rescore change lands, `pipeline.test.ts` is timing-sensitive. `:123-125` inserts an
  observation at `ts: new Date()` right after `/start`, inside the 200 ms test window. `:216-218`
  inserts an `llr: 5` observation whose `ts` may land inside or outside it, and `:223` asserts
  integrity under 70. Run `pipeline.test.ts` and `live.test.ts` before merging.

Frontend, read only; no edit needed:
- `use-live-room.ts:96` and `:160` read `score`, `calibrating` and `channels` from the snapshot and
  from `integrity.tick`.
- `live-sidebar.tsx:146-177` draws one bar per channel from `contribution`, even while calibrating.
  Bars that move in the first minute today stay empty.
- `candidate-panel.tsx:119` says "nothing is scored". That sentence becomes true.
- In that state the gauge shows "Calibrating..." (`integrity-gauge.tsx:130-132`). I did not check
  whether it also prints the number.

Why it waits: it changes live scoring, the integration tests that cover it cannot run on this machine
today, and the docs record the current behaviour as a decision that needs sign-off. It ships after
submission.

### 2026-09-18 — Containerized deployment
- Phase: 11 (post-completion follow-up; no new phase work)
- Built: `Dockerfile` (multi-stage: `deps`/`build`/`prod-deps`/`runtime`, non-root user, exec-form
  `CMD`, HTTP `HEALTHCHECK` via Node's global `fetch` since a slim image has no curl/wget) and
  `docker-compose.yml`'s opt-in `app` profile (`migrate`/`api`/`worker` services alongside the
  existing infra containers). Actually built the images and ran the full stack — not just written
  and assumed correct: a real session went through `register → session → config → link → preflight
  → policy → consent → media-ready → start → end`, the containerized `worker` picked up the real
  BullMQ job over the Docker network, all 8 pipeline steps `SUCCEEDED`, session reached `COMPLETE`
  with a non-degraded report — then verified both `api` and `worker` handle `SIGTERM` cleanly
  (`docker stop`, both exited in <0.3s, well inside the 10s grace period). Two real bugs surfaced by
  this exercise, both fixed (see Decisions log's two "Deployment bug, found and fixed" entries):
  `logger.ts` crash-looping under a misconfigured `NODE_ENV`, and the `worker` service inheriting a
  healthcheck it could never pass. Also hardened `worker.ts`'s shutdown to match `index.ts`'s
  (force-timeout, Prisma/Redis disconnect, `unhandledRejection`/`uncaughtException` handling — it
  previously only handled `SIGTERM`/`SIGINT` with a bare `process.exit(0)`). Separately: found and
  cleaned up a stray `pnpm-lock.yaml`/`pnpm-workspace.yaml` pair and a hybrid npm/pnpm
  `node_modules` from an earlier, unexplained `pnpm install` against this npm-only project — deleted
  both files, did a clean `rm -rf node_modules && npm install`, reverified. Restored local dev DB
  state afterward (the Docker smoke test's `docker compose down -v` had dropped the dev Postgres
  volume, including `veritrust_test`) via `prisma migrate dev`/`migrate deploy`
- Files: `Dockerfile` (new), `.dockerignore` (new), `docker-compose.yml`, `src/utils/logger.ts`,
  `src/worker.ts`, `README.md` (new "Deploying" section), `docs/STATUS_REPORT.md`,
  `docs/REMAINING_WORK.md`
- Schema/migrations: none
- New env vars: none (no new required vars; `docker-compose.yml`'s `app` profile documents which
  existing ones a deployment must override — `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`, `SMTP_HOST`)
- Tests: 179 passing (unchanged — this was infra/deployment work, not application logic); typecheck
  and build clean; full containerized stack verified live as described above
- Decisions: see Decisions log's "Deployment" and "Deployment bug, found and fixed" entries
- Issues left: none new. `docs/REMAINING_WORK.md` §1's "no worker auto-start" item is now resolved
  for a real deployment (still true for the bare host workflow, by design — `npm run dev`/
  `npm run worker` in separate terminals is the faster local-dev loop)
- Next: none queued — see Current status

### 2026-09-18 — Bug fixes + full sanity check
- Phase: 11 (post-completion follow-up; no new phase work)
- Built: fixed both bugs flagged in Phase 10's self-check (see Decisions log's two "Bug fix"
  entries) — `integrity-rescore.step.ts` now decays to `session.endedAt`, not `Date.now()`;
  `pipeline/flow.ts`'s RENDER_REPORT case now falls back to `deliverReport()` on its last attempt
  so a render failure can't strand a session in PROCESSING forever. Verified each fix by reverting
  it locally and confirming its regression test fails on the old code before restoring the fix.
  Then ran a full sanity check: `npm run typecheck`, `npm test` (179 passing), `npm run build`, then
  booted a real `npm run dev` + `npm run worker` and drove one session through the actual HTTP API
  and Socket.IO end to end (register → session → config → join link → preflight/policy/consent →
  media-ready → start → end), confirming the real BullMQ queue (not `runPipelineInline`) processed
  all 8 pipeline steps, the session reached COMPLETE with a non-degraded report, and
  `GET /sessions/:id/audit` returned the full transition history
- Files: `src/pipeline/steps/integrity-rescore.step.ts`, `src/pipeline/flow.ts`,
  `tests/integration/pipeline.test.ts` (+2 tests)
- Schema/migrations: none
- New env vars: none
- Tests: 179 passing (2 new); typecheck/build clean; live smoke test against real Postgres/Redis
  passed (session reached COMPLETE with `degraded: false`, `htmlAvailable: true`)
- Decisions: see Decisions log (`session.endedAt` for decay; `isLastAttempt` gate on `deliverReport`'s
  fallback, mirroring BullMQ's own `shouldRetryJob` math so an intermediate retry never prematurely
  completes the run)
- Issues left: none new
- Next: none queued — see Current status

### 2026-09-18 — Phase 11 retention, hardening, docs
- Phase: 11 (last phase in `Phases.md`)
- Built: `retention.service.ts` (4 windows, each with its own audit-log receipt — see "Phase 11
  additions" above and the Decisions log for the media/event-log/hard-delete reasoning) +
  `retention.worker.ts` + a nightly `upsertJobScheduler` registration in `worker.ts`;
  `GET /sessions/:id/audit` (service/controller/route/validator, OWNER/ADMIN only, cursor-paginated);
  security review of existing helmet/CORS/rate-limit config against Phases.md §11 (all three were
  already in place from earlier phases — auth/join/code-run all rate-limited per PRD §5's spec; the
  one real gap found and fixed was a missing `Retry-After` header on 429s); `npm audit` run (3
  findings, all only fixable via `--force`, left unfixed and documented); `scripts/load-test-
  telemetry.ts` (smoke-tested live for 5 continuous minutes at the target 4 events/s, zero backlog
  throughout — full 60-minute run not executed in this session, see Known issues);
  `backend/README.md` (didn't exist before this phase)
- Files: `src/services/retention.service.ts`, `src/workers/retention.worker.ts`, `src/worker.ts`,
  `src/utils/queues.ts`, `src/config/env.ts`, `.env.example`, `src/services/audit.service.ts`,
  `src/controllers/session.controller.ts`, `src/routes/session.routes.ts`,
  `src/validators/session.schema.ts`, `src/middlewares/rate-limit.ts`, `scripts/load-test-
  telemetry.ts`, `README.md`, `tests/integration/retention.test.ts` (new),
  `tests/integration/session.test.ts` (+3 audit tests), `tests/integration/coding.test.ts`
  (+1 assertion for `Retry-After`)
- Schema/migrations: none
- New env vars: `RETENTION_MEDIA_DAYS`, `RETENTION_OBSERVATIONS_DAYS`,
  `RETENTION_EVIDENCE_LOG_FLOOR_DAYS`, `RETENTION_REPORTS_DAYS`, `RETENTION_CRON`
- Tests: 177 passing (10 new: 7 retention, 3 audit); `npm run typecheck` and `npm run build` clean
- Decisions: see Decisions log (media row kept vs. hard-deleted, event-log floor vs. manifest,
  `upsertJobScheduler` over `repeat`, audit endpoint's narrower role gate, `Retry-After`, unfixed
  audit findings, load-test measurement approach)
- Issues left: the two Phase 10 self-check bugs (IntegrityRescore wall-clock decay; RenderReport
  failure sticks the pipeline in PROCESSING) are still unfixed — user chose to do Phase 11 first and
  come back to them; see Known issues for both plus the load-test/endedAt caveats above
- Next: none queued in `Phases.md`. Candidates: fix the two known bugs; wire the frontend to this
  API (currently 100% mock-data, unrelated to this phase); build a real CV/ASR/LLM provider (all
  `Deferred`)

### 2026-09-18 — Phase 10 post-processing pipeline and report
- Phase: 10
- Built: real 8-step BullMQ pipeline (`pipeline/flow.ts` + `pipeline/steps/*`, `step-runner.ts`) —
  SealVerify (own independently-queued job, not a FlowProducer tree node — see Decisions log),
  TranscriptFinalize (Q&A pairing, back-channel filtering), IntegrityRescore (authoritative offline
  replay through the same pure `fusion.engine.ts` functions, adjudication-adjusted), CodeEvaluate,
  MediaIndex (resolves the Phase 7/9 `mediaOffsetMs: null` TODO), AnswerGrading (zod `.strict()`
  rubric), CompositeScore (Architecture §6.9 formula), RenderReport (`eta` → HTML, optional
  `puppeteer` → PDF) + `deliverReport()` (summary-only email, `report.ready`, PROCESSING→COMPLETE);
  `GET /sessions/:id/report`, `GET /sessions/:id/pipeline`, `POST /sessions/:id/report/recompute`,
  `GET /reports/:id/html`, `GET /reports/:id/pdf`
- Files: see "Phase 10 additions" above
- Schema/migrations: none beyond what already existed for `PipelineRun`/`PipelineStepRun`/`Report`/
  `QAPair`/`AnswerGrade`/`CodeEvaluation`
- New env vars: `REPORT_PDF_ENABLED` (default `false`)
- New deps: `eta`, `puppeteer` (both pre-approved, Rules.md §3)
- Tests: 167 passing (`tests/integration/pipeline.test.ts`, new — happy path, forced-degraded via
  SealVerify-only failure, integrity<70→composite null, summary email excludes transcript/flag text)
- Decisions: see Decisions log (technical/communication sub-formula inventions, missing-input review-
  required, SealVerify-as-independent-job, IntegrityRescore's calibration-window behaviour matching
  live not ml/, `supersededByReview` definition, MediaIndex, recompute semantics, test conventions)
- Issues left: two bugs found in this phase's own self-check, not fixed here — see Known issues
  (IntegrityRescore decays to wall-clock time instead of session end; a RenderReport failure leaves
  the pipeline stuck in PROCESSING forever instead of degrading). Also: no process auto-starts
  `npm run worker` in this dev setup, so a session reaching PROCESSING needs it run manually (same
  pre-existing gap `jd-parse` already had)
- Next: Phase 11 — retention, hardening, docs

### 2026-09-18 — Phase 9 seal and evidence verification
- Phase: 9
- Built: `services/seal.service.ts` — `sealSession()`, the real 9-step sequence from Architecture.md §6.7,
  numbered and resumable via `s:{sid}:seal`'s `step` field (CAS LIVE→SEALING; drain the runtime's write
  queue up to `SEAL_DRAIN_TIMEOUT_MS`; destroy the runtime, which stops timers/lease and emits the
  candidate `session.ended` thank-you; stop/finalise the recording via the media provider, `FAILED` +
  continue on timeout; producer detach is a no-op beyond an audit-log line since `internal.service.ts`
  already rejects non-LIVE producer calls; final `IntegritySnapshot` + close every open `UnscoredWindow`;
  verify the hash chain and abort to `ABORTED` if it's already broken, then stream the evidence export;
  build/sign the manifest; CAS SEALING→PROCESSING) and `resumeStuckSeals()` (called once at boot, re-runs
  `sealSession()` for any session still `SEALING`, naturally degrading to DB-only steps when no live
  `SessionRuntime` survived the restart); `services/evidence.service.ts` gained `verifyChain()` (recomputes
  the hash chain from the `Observation` table, two-case tamper detection — see its own comment),
  `exportEvidenceLog()` (k-way merge of observations/flags/transcript/notes/executions, cursor-paginated
  500 rows at a time, streamed+gzipped straight into storage, never held fully in memory),
  `buildAndSignManifest()` (Ed25519-signs the canonical `manifest.json` bytes, writes `manifest.sig`
  alongside, upserts `EvidenceManifest`), and `verifySession()` (the `GET .../evidence/verify` logic:
  chain recomputed fresh from the DB + cross-checked against the manifest's stored `chainHead`/`lastSeq`,
  signature checked against the actual stored `manifest.json`/`manifest.sig` bytes); `media.service.ts`
  gained `startRecordingIfConfigured()`, called from `lifecycle.service.startSession` so there's actually
  something for seal step 4 to stop; `sockets/session-broadcast.ts` (extracted `broadcastSessionState`
  out of `lifecycle.service.ts` so `seal.service.ts` can reuse it without a circular import);
  `live/fusion/unscored.ts` gained `closeAllOpenUnscoredWindows()`; `GET /sessions/:id/evidence/verify`
- Files: `src/services/seal.service.ts`, `src/sockets/session-broadcast.ts`,
  `tests/integration/seal.test.ts`, edits to `src/services/{evidence,lifecycle,media}.service.ts`,
  `src/live/fusion/unscored.ts`, `src/controllers/session.controller.ts`, `src/routes/session.routes.ts`,
  `src/config/constants.ts`, `src/index.ts`, `tests/setup.ts`, `.env.test.example`,
  `tests/integration/lifecycle.test.ts` (stale "seal stubbed" comment fixed)
- Schema/migrations: none — `Recording`/`EvidenceManifest` and every enum needed already existed
- New env vars: none required in `.env`/`.env.example` (`EVIDENCE_SIGNING_PRIVATE_KEY`/`_KEY_ID` already
  existed from Phase 0); `tests/setup.ts` gained hardcoded test defaults for both so `getSigner()` works
  without running `keys:generate` first
- Tests: 157 passing total (5 new in `tests/integration/seal.test.ts`: happy path — real seal produces a
  `PROCESSING` session, a `READY` `Recording`, and a manifest that `GET .../evidence/verify` reports fully
  valid; a directly-tampered `Observation` payload is caught (`chainValid: false`, exact `firstBrokenSeq`,
  signature still valid); a directly-tampered `manifest.sig` is caught (`signatureValid: false`, chain
  still valid); a session force-set to `SEALING` with `registry.delete()`'d runtime and a stale Redis step
  is fully completed by `resumeStuckSeals()`; `evidence/verify` 404s before a session is sealed).
  `npm run typecheck`, `npm run build` clean
- Decisions: see Decisions log (recording start added in this phase, Redis step counter only covers
  steps 2-9, chain verify reads the DB not the export file, manifest signature checked against stored
  bytes not a DB reconstruction, `.sig` path derived not a new column, single active signing key only,
  detector/weights versions reuse existing constants, streamed k-way-merge export, `.pipe()` error
  forwarding fix, abort-on-broken-chain, pipeline enqueue deferred to Phase 10, hardcoded test signing key)
- Issues left: see Known issues (no lock against concurrent `sealSession()` invocations for the same
  session; no historical-key support if the signing key is ever rotated; recording finalize failure isn't
  surfaced anywhere beyond the DB row)
- Next: Phase 10 — post-processing pipeline and report. Wait for "next".

### 2026-09-18 — Phase 8 coding round
- Phase: 8
- Built: `live/detectors/authorship.detector.ts` (FR-DET-2, pure: per-sessionTaskId running typed/total
  char totals; large editor paste ≥`PASTE_LARGE_CHARS` → `paste_large`/PASTE, typed_ratio <0.35 once past
  `AUTHORSHIP_MIN_SOLUTION_CHARS` → `typed_ratio_low`/RHYTHM, sustained >8 chars/s TYPE bursts →
  `typing_burst`/RHYTHM — reusing PASTE/RHYTHM channels, see Decisions log); `providers/sandbox/
  docker.sandbox.ts` (real `dockerode` per-run container: python/python3/javascript/node only, no
  network, read-only rootfs + tmpfs /tmp, 256MB/1cpu/128pids, wall-clock kill, one container executes
  every test case for the request via a generated harness script; manually verified against a real local
  Docker daemon — see Decisions log for a `docker-modem` auto-JSON-parse bug that fix uncovered and
  worked around); `services/coding.service.ts` (getCandidateTasks, runTask — visible tests only, writes a
  RUN CodeSnapshot; submitTask — CAS claim on `submittedAt`, visible+hidden tests, writes a SUBMIT
  CodeSnapshot, calls `runtime.freezeTask()` + emits `task.frozen`; getSessionCode for the interviewer);
  `SessionRuntime.handleEditorDelta`/`handleEditorSnapshot`/`freezeTask` (in-memory per-task seq dedup +
  frozen-task set, same non-resume caveat as `FusionState`; deltas persisted as `EditorDelta` rows, then
  authorship-detector output flows through the same `applyFusionAndFlags` pipeline as telemetry); REST:
  `GET /candidate/tasks`, `POST /candidate/tasks/:taskId/{run,submit}` (run rate-limited 1/3s per
  session-task via `createRateLimiter`'s `keyGenerator`), `GET /sessions/:id/code`; sockets: candidate
  `editor.delta`/`editor.snapshot`, candidate-facing `task.frozen`; warden gained the `typing_burst`
  template (Design.md §6, now 8 of 9 types have wording)
- Files: `src/live/detectors/authorship.detector.ts`, `src/providers/sandbox/docker.sandbox.ts`,
  `src/services/coding.service.ts`, `src/validators/coding.schema.ts`,
  `tests/unit/authorship-detector.test.ts`, `tests/integration/coding.test.ts`, edits to
  `src/live/{session-runtime,detectors/types,warden}.ts`, `src/config/{constants,detection,env}.ts`,
  `src/sockets/{index,events}.ts`, `src/controllers/{candidate,session}.controller.ts`,
  `src/routes/{candidate,session}.routes.ts`, `src/providers/index.ts`, `.env.example`, `package.json`
- Schema/migrations: none (`CodingTask`/`SessionCodingTask`/`EditorDelta`/`CodeSnapshot`/`CodeExecution`
  already existed from the initial schema and were already migrated)
- New env vars: none required; `SANDBOX_PROVIDER` gained a `docker` option (still defaults to `mock`)
- New dependency: `dockerode` + `@types/dockerode` (already listed in Rules.md §3, no need to ask)
- Tests: 152 passing total (13 new: `tests/unit/authorship-detector.test.ts` — paste/burst/typed_ratio
  thresholds, independent per-sessionTaskId state; `tests/integration/coding.test.ts` — candidate task
  list excludes hiddenTests, run returns visible-only results and is rate-limited, submit runs
  hidden+visible and never leaks hiddenResults to the candidate while the DB row keeps them, submit
  freezes the task (further run/submit → 409 TASK_FROZEN) and emits `task.frozen`, interviewer code view
  sees hidden results (cross-org 404), editor.snapshot persists a CodeSnapshot, a large editor.delta paste
  crosses into a real `paste_large` flag end-to-end). `npm run typecheck`, `npm run build` clean; also
  manually smoke-tested `DockerSandboxProvider.execute()` against a real local Docker daemon (python,
  correct pass/fail per test case, correct stdout capture) after finding and fixing the `logs()` bug
- Decisions: see Decisions log (PASTE/RHYTHM reuse instead of a new channel, candidate `taskId` =
  `SessionCodingTask.id`, in-memory editor.delta dedup not Redis, `docker.sandbox.ts`'s `logs({follow:
  true})` fix, one container per run not per test case, only 4 language runners registered)
- Issues left: see Known issues (docker sandbox not in the automated suite by default, `typed_ratio_low`
  has no candidate template — intentional, harness-level vs container-level timeout, coding REST writes
  bypass the SessionRuntime write queue — intentional)
- Next: Phase 9 — Seal and evidence verification. Wait for "next".

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
