# VeriTrust Backend — Status Report

**As of:** 2026-09-18 · Phases 0–11 of `Phases.md` are all complete (the entire planned build). 179
tests passing across 22 files, `npm run typecheck` and `npm run build` clean, and a live end-to-end
smoke test (real `npm run dev` + `npm run worker`, real Postgres/Redis, real BullMQ queue) passed.

This is a snapshot of what exists, not a plan — for what's still missing or deferred, see
[`REMAINING_WORK.md`](REMAINING_WORK.md). For the exact API/event contract, see
[`Design.md`](Design.md); for how it fits together, [`Architecture.md`](Architecture.md); for
session-by-session history and every design decision made, [`Memory.md`](Memory.md).

---

## 1. What this is

An interview-integrity platform backend: an interviewer creates a session, a candidate joins through
a signed link and consents to monitoring, the interview runs live with real-time telemetry feeding a
fusion-scoring engine that raises flags and warnings, and afterward a post-processing pipeline
produces a scored, evidence-linked report. Every score is reconstructable from raw evidence; a
cryptographic hash chain plus an Ed25519-signed manifest make the evidence tamper-evident.

**Stack:** Express 5 (TypeScript, ESM) · Prisma 7 + PostgreSQL · Redis (`ioredis`) · BullMQ (queues) ·
Socket.IO 4 (realtime) · `jose`/`argon2` (auth) · `zod` (validation everywhere) · `eta`/`puppeteer`
(reports) · `dockerode` (code sandbox) · Vitest/Supertest (tests).

**Scale:** 36 Prisma models, 28 enums · 14 controllers · 24 services · 12 middlewares · 8 pipeline
steps · 5 live detectors · 3 background workers · ~75 REST endpoints · 179 tests.

---

## 2. Architecture at a glance

Two processes, one Postgres, one Redis:

- **API process** (`npm run dev`, port 9000) — Express REST (`controllers/` → `services/`), Socket.IO
  (`/interviewer` and `/candidate` namespaces), and the **live engine** (telemetry → 5 pure detectors
  → fusion/decay/corroboration → flags → warden warnings) for whichever sessions it's currently
  handling. Single instance in this build; the fusion lease (Redis `SET NX`) is what would let a
  second instance coexist later.
- **Worker process** (`npm run worker`) — BullMQ workers: JD parsing, join-link expiry, the 8-step
  post-processing pipeline, and the nightly retention sweep. **Required** for a session to actually
  finish processing or for a join link to expire — the API process alone won't advance either.

Everything a candidate can receive is allow-listed at the socket layer (`CANDIDATE_EVENTS`) — no
score, flag, threshold or hidden-test output can reach a candidate-facing endpoint or event, checked
by a dedicated test (`candidate-boundary.ts` helper, scanned across a full scripted session).

---

## 3. Session lifecycle (state machine)

```
DRAFT → CONFIGURED → ARMED → ADMITTED → LIVE → SEALING → PROCESSING → COMPLETE
                        ↓                                      ↑
                     EXPIRED                                (or DEGRADED on a failed step,
  any status → ABORTED                                        still delivered)
```

All transitions go through one place, `session-state.service.ts::transition()` — a compare-and-swap
(`updateMany` gated on current status) plus an audit-log write in the same DB transaction, so a lost
race never silently succeeds and every transition is independently auditable
(`GET /sessions/:id/audit`).

---

## 4. Full route inventory

Auth shorthand: **Public** = no token · **U** = any authenticated org user (`requireUser`) ·
**U+role** = `requireUser` + `requireRole(...)` · **Session(R)** / **Session(W)** = `requireUser` +
`requireSessionAccess()` (read: OWNER/ADMIN/REVIEWER or a bound INTERVIEWER; write: OWNER/ADMIN only)
· **Candidate** = candidate JWT (`requireCandidateToken`) · **Join** = signed join token
(`requireJoinToken`, re-checked against live DB state on every call) · **Internal** = service token
(`requireServiceToken`, for CV/ASR/producer callers).

### Auth & orgs (`auth.controller.ts`, `org.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/auth/register` | Public | Creates a user + org, returns access token + refresh cookie |
| POST | `/auth/login` | Public | Password login (argon2id) |
| POST | `/auth/refresh` | Public (cookie) | Rotates refresh token; reuse of a revoked token revokes its whole family |
| POST | `/auth/logout` | Public (cookie) | Revokes the refresh token |
| GET | `/auth/me` | U | Current user + active org |
| POST | `/auth/switch-org` | U | Switches the active-org claim to another membership |
| GET | `/org` | U | Current org |
| PATCH | `/org` | U+role(O,A) | Update org settings |
| GET | `/org/members` | U | List members |
| POST | `/org/members` | U+role(O,A) | Add a member (target user must already exist — no invite-by-email-creates-user flow yet) |
| PATCH | `/org/members/:memberId` | U+role(O,A) | Change a member's role |
| DELETE | `/org/members/:memberId` | U+role(O,A) | Remove a member (blocks removing the last OWNER) |

### Candidate directory (`candidate-directory.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/candidates` | U | List org's candidates |
| POST | `/candidates` | U | Create a candidate |
| GET | `/candidates/:id` | U | Get one candidate |

### Sessions — core (`session.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/sessions` | U | Create a session (creator becomes primary interviewer) |
| GET | `/sessions` | U | List org's sessions, cursor-paginated, filterable by status/date |
| GET | `/sessions/:id` | Session(R) | Get one session |
| PATCH | `/sessions/:id` | Session(W) | Edit basic fields (only while DRAFT/CONFIGURED/ARMED) |
| POST | `/sessions/:id/cancel` | Session(W) | Cancel → ABORTED |
| PATCH | `/sessions/:id/config` | Session(W) | Set interview type, channels, sensitivity, tasks, recording flags — flips `needsReconsent` if a channel is added after consent |
| POST | `/sessions/:id/start` | Session(W) | ADMITTED → LIVE (guards: media ready, no pending reconsent); starts recording + the live runtime |
| POST | `/sessions/:id/end` | Session(W) | LIVE → SEALING → PROCESSING (idempotent past LIVE); triggers the real 9-step seal sequence and enqueues the pipeline |
| GET | `/sessions/:id/live` | Session(R) | Dashboard-reload hydrate: status, elapsed/remaining, integrity, flags, notes |
| POST | `/sessions/:id/interviewers` | Session(W) | Bind another interviewer to the session |
| DELETE | `/sessions/:id/interviewers/:userId` | Session(W) | Unbind (blocks removing the primary) |

### Sessions — JD (`jd.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/sessions/:id/jd` | Session(W) | Upload a JD file (PDF/DOCX/text, 10MB cap via multer) → queues async parse |
| GET | `/sessions/:id/jd` | Session(R) | Get parsed JD |
| PATCH | `/sessions/:id/jd` | Session(W) | Manually edit the parsed JD (zod-validated shape) |
| POST | `/sessions/:id/jd/reparse` | Session(W) | Re-queue parsing |

### Sessions — links & join flow (`link.controller.ts`, `join.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/sessions/:id/links` | Session(W) | Create a join link (ONE_TIME or reusable), emails the candidate |
| GET | `/sessions/:id/links` | Session(R) | List links |
| POST | `/sessions/:id/links/:linkId/revoke` | Session(W) | Revoke a link |
| GET | `/join/:token` | Join | Join-link summary (status, session basics) |
| POST | `/join/:token/preflight` | Join | Candidate device/network probe check |
| GET | `/join/:token/policy` | Join | Monitoring-disclosure bullets + `policyHash`, computed fresh from current config every call |
| POST | `/join/:token/consent` | Join | Records consent (verifies `policyHash` hasn't gone stale) → issues candidate JWT, ARMED → ADMITTED |

### Sessions — coding round (`coding-task.controller.ts`, `question-bank.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET / POST | `/coding-tasks` | U / U+role(O,A) | List / create org coding tasks (hidden tests hidden from list + non-admin reads) |
| GET | `/coding-tasks/:id` | U | Get one task |
| PATCH / DELETE | `/coding-tasks/:id` | U+role(O,A) | Edit / delete |
| GET / POST | `/question-bank` | U / U+role(O,A) | List / create question-bank items |
| PATCH / DELETE | `/question-bank/:id` | U+role(O,A) | Edit / delete |
| GET | `/sessions/:id/code` | Session(R) | Interviewer view of the candidate's code (with hidden results) |

### Sessions — live monitoring, notes, suggestions, evidence, report (`flag`, `session`, `report` controllers)
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/sessions/:id/flags` | Session(R) | List flags (+ latest warning, adjudication history) |
| POST | `/flags/:flagId/adjudicate` | U (own check inside service) | CONFIRM/DISMISS/DOWNGRADE a flag; nudges the live score |
| GET / POST | `/sessions/:id/notes` | Session(R) / Session(W) | Interviewer notes |
| POST | `/sessions/:id/suggestions/refresh` | Session(W) | Manually trigger LLM follow-up-question suggestions |
| POST | `/sessions/:id/suggestions/:suggestionId/accept` | Session(W) | Accept a suggestion |
| GET | `/sessions/:id/evidence/verify` | Session(R) | Recomputes the hash chain from raw observations + verifies the signed manifest against stored bytes — two independent tamper checks |
| GET | `/sessions/:id/report` | Session(R) | Full report JSON (scores, sections, methodology, `degraded`/`lostSteps`) |
| GET | `/reports/:reportId/html` | U | Rendered HTML report |
| GET | `/reports/:reportId/pdf` | U | PDF report (404 if `REPORT_PDF_ENABLED=false`) |
| GET | `/sessions/:id/pipeline` | Session(R) | Post-processing run + per-step statuses |
| POST | `/sessions/:id/report/recompute` | Session(R) | Re-runs the whole pipeline (e.g. after a post-delivery adjudication) |
| GET | `/sessions/:id/audit` | **U+role(O,A)** + Session(R) | Full audit-log trail for the session, cursor-paginated — narrower access than every other session endpoint (Phase 11) |

### Candidate-facing (`candidate.controller.ts`) — everything here is allow-listed, no scores/flags ever
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/candidate/session` | Candidate | Candidate's own session view (thank-you-screen-safe payload) |
| POST | `/candidate/media-ready` | Candidate | Reports camera/mic/screen tracks are live |
| GET | `/candidate/tasks` | Candidate | Assigned coding tasks (session-scoped ids) |
| POST | `/candidate/tasks/:taskId/run` | Candidate (rate-limited 1/3s per task) | Runs visible tests only |
| POST | `/candidate/tasks/:taskId/submit` | Candidate | Runs hidden tests, freezes the task, records the grade input |

### Internal (CV/ASR/producer ingest) (`internal.controller.ts`)
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/internal/sessions/:id/observations` | Internal | External producer pushes raw observations into the same evidence chain as client telemetry |
| POST | `/internal/sessions/:id/transcript` | Internal | Pushes ASR transcript segments |
| POST | `/internal/sessions/:id/heartbeat` | Internal | Producer liveness signal — drives `system.degraded` on stale/missing heartbeats |

### Health
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/health` | Public | Liveness |
| GET | `/ready` | Public | Readiness — pings real Postgres + Redis |

---

## 5. Real-time (Socket.IO)

Two namespaces on the same HTTP server as Express (no separate realtime process):

- **`/interviewer`** — access JWT in handshake. Client emits `session.join {sessionId, lastFrameSeq?}`
  with an ack; server replays any buffered frames the client missed (Redis-backed, capped 2000/session)
  then streams live: `session.state`, `jd.parsed`, `candidate.presence`, `timer.tick`,
  `system.degraded`, `transcript.partial/final`, `integrity.tick` (2s), `flag.new/update`,
  `warn.issued`, `note.added`, `qs.suggestions`, `report.ready`.
- **`/candidate`** — candidate JWT, auto-joins its own session room. Receives only:
  `session.state`, `time.remaining`, `session.ended`, `warn.show` (candidate-facing warning copy,
  never a score or narrative), `task.frozen`. Sends: `clock.sync`/`clock.offset`, `tel.batch`
  (telemetry, 250ms batches), `editor.delta`/`editor.snapshot`, `warn.ack`.

---

## 6. The live engine (one instance per LIVE session, in-process)

`live/session-runtime.ts` owns, per session: a Redis fusion lease (one writer guarantee), a 1s timer
tick, candidate presence/abandon-grace tracking, and a single serialized write queue that every
telemetry batch, editor delta, and external-producer observation goes through — this is what keeps
the evidence hash chain's `seq`/`prevHash`/`hash` assignment race-free.

Each accepted telemetry event runs through 5 pure, side-effect-free detectors
(`live/detectors/*.detector.ts` — focus, paste, pointer, environment, rhythm, plus a coding-round
authorship detector reusing PASTE/RHYTHM), then the pure fusion engine
(`live/fusion/fusion.engine.ts`: exponential decay per channel, corroboration boost across channels,
sigmoid integrity score), then flag-building (threshold crossing + 15s same-type merge) and the
warden (tiered candidate warnings with cooldown/cap, fixed templates — a candidate never sees a raw
score or narrative).

---

## 7. Post-processing pipeline (8 steps, real BullMQ)

Triggered automatically on session end (`seal.service.ts`'s last step calls `enqueuePipeline`).
`SealVerify` runs as its own independently-queued job (nothing downstream reads its output, and
BullMQ's `FlowProducer` only models trees, not the true fan-out DAG); the other 7 form a real tree
rooted at `RenderReport`:

```
RenderReport
 +-- CompositeScore
 |     +-- AnswerGrading -> TranscriptFinalize
 |     +-- CodeEvaluate
 |     +-- IntegrityRescore
 +-- MediaIndex
```

| Step | What it does |
|---|---|
| **SealVerify** | Re-verifies the hash chain + signed manifest one more time, independently |
| **TranscriptFinalize** | Pairs interviewer questions with candidate answers, filters back-channel noise ("mhm") |
| **IntegrityRescore** | The *authoritative* offline score — replays every observation through the exact same pure fusion functions the live engine used, excluding frozen-window observations and adjudication-adjusted evidence, decayed to the session's actual end time (not wall-clock run time — see §9) |
| **CodeEvaluate** | Scores hidden-test pass rate, typed-ratio, burst-rate for any coding round |
| **MediaIndex** | Anchors every flag/note to a recording media offset |
| **AnswerGrading** | LLM-graded rubric per Q&A pair (correctness, depth, specificity, structure, hands-on) |
| **CompositeScore** | `technical`/`communication`/`integrity` → composite formula with the I<70 review-required band |
| **RenderReport** | Renders HTML (always) + optional PDF (`REPORT_PDF_ENABLED`), then delivers: marks the run SUCCEEDED/DEGRADED, sends the summary-only email, transitions PROCESSING→COMPLETE, fires `report.ready` — now guaranteed to run even if rendering itself fails on its last retry (see §9) |

A step failing never blocks the whole run (`failParentOnFailure: false`) — the report just comes back
`degraded: true` with `lostSteps` naming what didn't complete.

---

## 8. Evidence & retention

- **Hash chain**: every observation carries `seq`/`prevHash`/`hash`, gapless per session, assigned in
  exactly one place (`evidence.service.ts::appendObservations`). `GET /sessions/:id/evidence/verify`
  recomputes the whole chain from the DB (catches tampering) and separately verifies the Ed25519
  signature against the actual stored manifest bytes (catches a post-seal file edit).
- **Retention** (`retention.service.ts`, nightly BullMQ job): recordings + media index cleared at 90
  days, raw observations hard-deleted at 180 days, the raw evidence event log purged at a 30-day
  floor (the signed manifest/chain-head stay forever), reports + transcripts hard-deleted at 3 years.
  Every purge writes an `audit_logs` receipt. All four windows are env-configurable
  (`RETENTION_*_DAYS`).
- **Security**: `helmet`, `cors` (allow-listed origins), `express-rate-limit` + Redis store (broad API
  limiter + dedicated auth/join/code-run limiters, `Retry-After` header on 429s), argon2id passwords,
  SHA-256-hashed rotating refresh tokens (reuse revokes the whole token family), signed join/candidate
  JWTs re-checked against live DB state on every call (not just `exp`).

---

## 9. Recently fixed (this session)

Two bugs found in a Phase 10 self-check, both now fixed and regression-tested:

1. **IntegrityRescore reproducibility** — was decaying to `Date.now()` (wall-clock pipeline-run time)
   instead of the session's own `endedAt`, so the "authoritative" rescored score silently drifted
   depending on queue delay or how late a recompute ran. Fixed to decay to `session.endedAt`.
2. **Stuck-in-PROCESSING on report-render failure** — if `RenderReport` itself threw (storage/puppeteer
   failure), the delivery logic that marks the run DEGRADED and transitions to COMPLETE never ran,
   since RenderReport is the pipeline tree's root with nothing downstream of it. Fixed: on the last
   BullMQ retry attempt, delivery now runs as a fallback even when rendering failed.

---

## 10. Test suite (179 tests, 22 files)

**Unit (68 tests, 9 files)** — pure logic, no I/O: `fusion-engine` (18), `detectors` (18),
`hash-and-providers` (7), `authorship-detector` (7), `detection-contract` (6, guards backend/ml
vocabulary drift), `error-handler` (4), `producer-health` (4), `timer` (2), `calibration` (2).

**Integration (111 tests, 13 files)** — real Postgres + Redis, real HTTP via supertest, real
Socket.IO client where relevant: `auth` (14), `session` (17, incl. the new audit-log tests), `live`
(17, flags/warden/adjudication/candidate-boundary scan), `telemetry` (8, hash chain + dedup/gap),
`lifecycle` (8), `join` (10), `coding` (6), `coding-task` (5), `app` (5), `seal` (5), `pipeline` (6,
incl. the two new bug-fix regression tests), `retention` (7), `session-runtime` (3).

Run: `npm run typecheck && npm test` from `backend/`. All green as of this report.

---

## 11. How to run it

See [`README.md`](../README.md) for full setup. Short version, local dev:

```bash
docker compose up -d && npm install && npm run keys:generate   # paste output into .env
npm run db:migrate -- --name init
npm run dev      # API :9000
npm run worker    # separate terminal — required for sessions to finish processing
```

## 12. Deployment

A production `Dockerfile` (multi-stage; no native Prisma engine binary, since `@prisma/adapter-pg`
is used directly — see §1) builds the same image for both the `api` and `worker` roles. Verified
this session by actually building and running the full containerized stack (Postgres/Redis/mailpit
+ `migrate`/`api`/`worker` via `docker compose --profile app up --build`) and driving a real session
through it end-to-end, including a clean `SIGTERM` shutdown of both processes. Two real bugs were
caught and fixed by that smoke test — a `NODE_ENV`-misconfiguration crash in `logger.ts`, and a
meaningless inherited HTTP healthcheck on the worker container — see
[`REMAINING_WORK.md`](REMAINING_WORK.md) §1a. Full deployment requirements (real secrets,
`NODE_ENV=production`, a persistent storage volume, running the worker as its own service,
`prisma migrate deploy` before first boot) are in [`README.md`](../README.md)'s "Deploying" section.
