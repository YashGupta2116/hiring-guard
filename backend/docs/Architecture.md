# Architecture.md — VeriTrust Backend

> Source of truth for data: `backend/prisma/schema.prisma`.
> Source of truth for API shapes and socket events: `Design.md`.
> What to build and in what order: `Phases.md`.

---

## 1. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js ≥ 22 | ESM (`"type": "module"`), TypeScript `module: NodeNext` |
| Language | TypeScript 5, `strict: true` | Relative imports use `.js` extensions |
| HTTP | Express 5 | Express 5 forwards rejected promises to the error handler natively |
| Validation | zod | Every body, query, param, socket payload and env var |
| ORM / DB | Prisma **7** + `@prisma/adapter-pg` + PostgreSQL 16+ | Pinned to v7. Do **not** upgrade to Prisma 8 |
| Cache / live state | Redis 7 + `ioredis` | Live session state, leases, buffers, cooldowns, rate limits |
| Queues / jobs | BullMQ | Replaces SQS, EventBridge and Step Functions |
| Realtime | Socket.IO 4 | Two namespaces: `/interviewer`, `/candidate` |
| Auth | `jose` (JWT), `argon2` (passwords) | Access JWT 15 min, refresh token 30 days rotating |
| File upload | `multer` (memory storage, 10 MB) | |
| Object storage | Local disk in dev, S3 later | Behind `StorageProvider` interface |
| JD text extraction | `pdf-parse`, `mammoth` | Scanned PDFs → parse fails → manual fallback |
| LLM calls | `LlmProvider` interface, `MockLlmProvider` default | Real provider added later; no ML work now |
| Media (WebRTC) | LiveKit via `livekit-server-sdk` | `MockMediaProvider` in dev (`MEDIA_PROVIDER=mock`) |
| Code sandbox | Docker via `dockerode` | `MockSandbox` for dev without Docker |
| Email | `nodemailer` + `ics` | Mailpit / Ethereal in dev |
| Report rendering | `eta` templates → HTML, `puppeteer` → PDF | PDF optional, HTML required |
| Signing | Node `crypto` Ed25519 | Behind `Signer` interface, KMS later |
| Logging | `pino`, `pino-http` | JSON logs with `requestId`, `sessionId` |
| Security middleware | `helmet`, `cors`, `express-rate-limit` + `rate-limit-redis` | |
| IDs | `ulid` | `ses_<ulid>` for sessions, cuid elsewhere (Prisma default) |
| Testing | `vitest`, `supertest`, `socket.io-client` | |
| Dev runner | `tsx watch` | Build with `tsc` |

---

## 2. Mapping the spec (Go + AWS) to this stack

| Spec component | Implementation here |
|---|---|
| Gateway (Go) | Express app + Socket.IO server |
| `internal/detect` | `src/live/detectors/*.ts` |
| Fusion actor (single writer, Redis lease, 200 ms tick) | `src/live/fusion/` in-process actor per session + Redis lease `s:{sid}:lease` |
| Warden | `src/live/warden.ts` |
| SQS `jd-parse` queue | BullMQ queue `jd-parse` |
| EventBridge T-15 m | BullMQ delayed job `session-arm` |
| Step Functions post-processing | BullMQ `FlowProducer` + `pipeline_runs` / `pipeline_step_runs` tables |
| `qe.parse_jd`, `qe.suggest`, AnswerGrading (Bedrock) | `LlmProvider` (mock now) |
| cv / asr services (gRPC) | External, push to `POST /api/v1/internal/...` with service token |
| KMS join JWT / manifest signing | `jose` HS256 secret / Ed25519 key from env, behind `Signer` |
| S3 | `StorageProvider` (local disk now) |
| SES | `MailProvider` (nodemailer) |
| Aurora | PostgreSQL via Prisma |
| exec sandbox | Docker containers via dockerode |

---

## 3. Process layout

```
┌──────────────────────────────────────────────┐        ┌───────────────────────────┐
│  api process  (npm run dev / start)          │        │ worker process            │
│                                              │        │ (npm run worker)          │
│  Express REST  ── controllers → services ──┐ │        │                           │
│  Socket.IO  /interviewer  /candidate       │ │        │ jd-parse worker           │
│  Live engine: detectors → fusion → warden  │ │        │ session-schedule worker   │
│  Seal sequence                             │ │        │ pipeline workers (steps)  │
└────────────────────────────────────────────┼─┘        │ email worker              │
                                             │          │ retention worker (nightly)│
             ┌───────────────┬───────────────┼──────────┴───────────┬───────────────┘
             ▼               ▼               ▼                      ▼
        PostgreSQL         Redis        Object storage        Docker (sandbox)
                     (state, BullMQ,    (local / S3)
                      pub/sub)
External (later): LiveKit server, CV service, ASR service, LLM provider
```

- The **live engine runs inside the api process** that owns the session's socket traffic. MVP is a single
  api instance. For horizontal scaling later: Socket.IO Redis adapter + the fusion lease already guarantees
  one writer per session.
- Workers talk to the api process only through Redis pub/sub channel `events:{sessionId}`
  (e.g. `jd.parsed`, `report.ready`), which the api process forwards to sockets.

---

## 4. Folder structure

Layer-based, matching the existing project (`controllers/`, `routes/`, `utils/`).

```
backend/
├── docs/                          # PRD, Architecture, Rules, Phases, Design, Memory
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── prisma.config.ts               # Prisma 7 config (datasource url lives here)
├── templates/
│   ├── report.eta                 # report HTML template
│   └── email/                     # invite + summary email templates
├── tests/
│   ├── integration/
│   └── unit/
├── src/
│   ├── index.ts                   # bootstrap: http server, socket server, graceful shutdown
│   ├── app.ts                     # express app: middleware, routes, error handler
│   ├── worker.ts                  # bootstrap for all BullMQ workers
│   │
│   ├── config/
│   │   ├── env.ts                 # zod-validated env, exported typed `env`
│   │   ├── constants.ts           # timings: grace periods, cooldowns, tick rates, caps
│   │   └── detection.ts           # SERVER-ONLY: LLR tables, weights, thresholds, decay, sensitivity
│   │
│   ├── routes/                    # express Routers only, no logic
│   │   ├── index.ts               # mounts everything under /api/v1
│   │   ├── auth.routes.ts
│   │   ├── org.routes.ts
│   │   ├── candidate-directory.routes.ts
│   │   ├── session.routes.ts
│   │   ├── jd.routes.ts
│   │   ├── task.routes.ts
│   │   ├── question-bank.routes.ts
│   │   ├── link.routes.ts
│   │   ├── join.routes.ts         # public, join-token auth
│   │   ├── candidate.routes.ts    # candidate-token auth
│   │   ├── live.routes.ts         # flags, notes, suggestions, live snapshot
│   │   ├── report.routes.ts
│   │   ├── evidence.routes.ts
│   │   ├── internal.routes.ts     # service-token auth (cv, asr)
│   │   └── webhook.routes.ts      # livekit webhooks
│   │
│   ├── controllers/               # parse req → call service → send response
│   │   └── <name>.controller.ts
│   │
│   ├── services/                  # business logic, Prisma access, transactions
│   │   ├── auth.service.ts
│   │   ├── org.service.ts
│   │   ├── session.service.ts
│   │   ├── session-state.service.ts   # THE state machine, CAS transitions, audit
│   │   ├── jd.service.ts
│   │   ├── config.service.ts
│   │   ├── link.service.ts
│   │   ├── join.service.ts            # preflight, policy, consent
│   │   ├── media.service.ts           # media.ready, tokens, egress control
│   │   ├── lifecycle.service.ts       # start, end
│   │   ├── flag.service.ts
│   │   ├── note.service.ts
│   │   ├── suggestion.service.ts
│   │   ├── coding.service.ts
│   │   ├── seal.service.ts
│   │   ├── evidence.service.ts        # hash chain, manifest, verify
│   │   ├── pipeline.service.ts
│   │   ├── scoring.service.ts
│   │   ├── report.service.ts
│   │   ├── audit.service.ts
│   │   └── retention.service.ts
│   │
│   ├── validators/                # zod schemas, one file per resource
│   │   └── <name>.schema.ts
│   │
│   ├── middlewares/
│   │   ├── request-id.ts
│   │   ├── auth.ts                # requireUser (access JWT)
│   │   ├── org-role.ts            # requireRole('ADMIN', ...)
│   │   ├── session-access.ts      # loads session, checks org + interviewer binding
│   │   ├── join-token.ts          # verifies join JWT + jti state
│   │   ├── candidate-token.ts
│   │   ├── service-token.ts
│   │   ├── validate.ts            # validate({ body, query, params })
│   │   ├── upload.ts              # multer config
│   │   ├── rate-limit.ts
│   │   ├── not-found.ts
│   │   └── error-handler.ts
│   │
│   ├── sockets/
│   │   ├── index.ts               # create io, namespaces, auth middleware
│   │   ├── interviewer.socket.ts
│   │   ├── candidate.socket.ts
│   │   ├── emitter.ts             # emitToDashboard(sid, event, data) with buffer + frame seq
│   │   └── events.ts              # event name constants + zod payload schemas
│   │
│   ├── live/                      # the realtime integrity engine (no HTTP here)
│   │   ├── session-runtime.ts     # per-session actor: owns lease, queue, timers
│   │   ├── registry.ts            # sid → SessionRuntime
│   │   ├── ingest.ts              # clock correction, seq, dedup, grace handling
│   │   ├── calibration.ts         # baselines during first 60 s
│   │   ├── detectors/
│   │   │   ├── types.ts           # Detector interface
│   │   │   ├── focus.detector.ts
│   │   │   ├── paste.detector.ts
│   │   │   ├── rhythm.detector.ts
│   │   │   ├── pointer.detector.ts
│   │   │   ├── env.detector.ts
│   │   │   └── authorship.detector.ts
│   │   ├── fusion/
│   │   │   ├── fusion.engine.ts   # pure math: decay, corroboration, score
│   │   │   ├── flag-builder.ts    # threshold, merge window, scoreDelta
│   │   │   └── unscored.ts
│   │   ├── warden.ts
│   │   ├── timer.ts               # clock freeze, topic budgets, duration limit
│   │   └── producer-health.ts     # heartbeats → system.degraded
│   │
│   ├── pipeline/                  # post-processing steps (run in worker)
│   │   ├── flow.ts                # builds the BullMQ flow
│   │   └── steps/
│   │       ├── seal-verify.step.ts
│   │       ├── transcript-finalize.step.ts
│   │       ├── integrity-rescore.step.ts
│   │       ├── code-evaluate.step.ts
│   │       ├── media-index.step.ts
│   │       ├── answer-grading.step.ts
│   │       ├── composite-score.step.ts
│   │       └── render-report.step.ts
│   │
│   ├── workers/
│   │   ├── jd-parse.worker.ts
│   │   ├── session-schedule.worker.ts
│   │   ├── pipeline.worker.ts
│   │   ├── email.worker.ts
│   │   └── retention.worker.ts
│   │
│   ├── providers/                 # anything external, always behind an interface
│   │   ├── llm/        (llm.provider.ts, mock.llm.ts)
│   │   ├── media/      (media.provider.ts, livekit.media.ts, mock.media.ts)
│   │   ├── sandbox/    (sandbox.provider.ts, docker.sandbox.ts, mock.sandbox.ts)
│   │   ├── storage/    (storage.provider.ts, local.storage.ts)
│   │   ├── mail/       (mail.provider.ts, smtp.mail.ts)
│   │   └── signer/     (signer.ts, ed25519.signer.ts)
│   │
│   ├── utils/
│   │   ├── prisma.ts              # PrismaClient singleton with PrismaPg adapter
│   │   ├── redis.ts               # ioredis clients (main, sub, bullmq)
│   │   ├── queues.ts              # BullMQ queue instances + names
│   │   ├── logger.ts
│   │   ├── app-error.ts           # AppError class + error codes
│   │   ├── ids.ts                 # newSessionId()
│   │   ├── hash.ts                # sha256, canonical JSON, hmac for ip/ua
│   │   ├── jwt.ts                 # sign/verify access, join, candidate tokens
│   │   ├── time.ts
│   │   └── respond.ts             # ok(res, data, meta?) helpers
│   │
│   ├── types/
│   │   ├── express.d.ts           # req.user, req.org, req.session, req.candidate
│   │   ├── parsed-jd.ts
│   │   └── telemetry.ts
│   │
│   └── generated/prisma/          # prisma client output (gitignored)
├── .env / .env.example
├── package.json
└── tsconfig.json
```

**Dependency direction (enforced by convention):**
`routes → controllers → services → (utils, providers, prisma)`.
`sockets → services / live`. `live → services (evidence, flag), utils`. `workers → pipeline / services`.
Controllers never import Prisma. Services never import `express` types.

---

## 5. Session state machine

```
             PATCH config (valid)          POST links
   DRAFT ───────────────────────► CONFIGURED ──────────► ARMED
     │                                │                    │  consent accepted
     │                                │                    ▼
     │                                │                 ADMITTED ──── POST start ────► LIVE
     │                                │                    │     (media ready,           │
     │                                │                    │      no re-consent)         │ end / duration / abandon
     │                                │                    │                             ▼
     │                                │                    │                          SEALING
     │                                │                    │                             │ seal done
     │                                │                    │                             ▼
     │                                │                    │                         PROCESSING
     │                                │                    │                             │ report delivered
     │                                │                    │                             ▼  (full or degraded)
     └──────── cancel / decline / fatal ─────────────────► ABORTED                   COMPLETE
                                         ARMED ── window passed, never used ──► EXPIRED
```

| From | To | Trigger | Guard |
|---|---|---|---|
| DRAFT | CONFIGURED | `PATCH /sessions/:id/config` | config valid, tasks belong to org |
| CONFIGURED | ARMED | `POST /sessions/:id/links` | — |
| ARMED | ADMITTED | `POST /join/:token/consent` accepted | token valid, preflight passed |
| ADMITTED | LIVE | `POST /sessions/:id/start` | media ready, `needsReconsent = false` |
| LIVE | SEALING | `POST /sessions/:id/end`, duration timer, socket grace expired | — |
| SEALING | PROCESSING | seal sequence completed | manifest signed |
| PROCESSING | COMPLETE | render-report step finished | — |
| DRAFT, CONFIGURED, ARMED, ADMITTED | ABORTED | cancel, candidate declines consent | — |
| LIVE, SEALING, PROCESSING | ABORTED | fatal error | partial evidence preserved |
| ARMED | EXPIRED | schedule job | no consent inside window |

**Rules:**
- All transitions go through `sessionState.transition(sid, from[], to, ctx)` which runs
  `UPDATE ... WHERE id = $1 AND status IN (...)` (compare-and-set via `prisma.updateMany`), checks
  `count === 1`, writes `audit_logs` in the **same transaction**, then publishes `session.state`.
- Config edits are allowed in `CONFIGURED`, `ARMED`, `ADMITTED`. If a channel is **added** after a consent
  exists, set `needsReconsent = true` and bump `configVersion`.

---

## 6. Core flows

### 6.1 Setup (Workflow 01, steps 1 to 5)

```
POST /sessions ─► session.service.create ─► INSERT session (DRAFT) + session_interviewers + audit ─► 201
POST /sessions/:id/jd ─► multer ─► storage.put(jd/original.ext) ─► INSERT job_descriptions(PENDING)
                       ─► queue jd-parse ─► 202
   worker: extract text ─► llm.parseJd (zod-validated ParsedJD) ─► normalise skills ─► topic budgets
         ─► UPDATE job_descriptions(PARSED | FAILED) ─► publish events:{sid} jd.parsed
PATCH /sessions/:id/config ─► validate ─► UPDATE ─► transition DRAFT→CONFIGURED (if DRAFT)
POST /sessions/:id/links ─► mint join JWT (jti) ─► INSERT join_tokens ─► transition →ARMED
   scheduled: queue email (invite + ics), queue delayed session-schedule jobs (T-15m, expiry)
```

### 6.2 Join (Workflow 03, steps 1 to 5)

```
GET  /join/:token              ─► token check ─► public session summary
POST /join/:token/preflight    ─► evaluate probe ─► INSERT preflight_checks ─► {passed, failures, warnings}
GET  /join/:token/policy       ─► build policy from effective config ─► {bullets, retentionDays, viewers, policyHash}
POST /join/:token/consent      ─► verify policyHash == current ─► INSERT consents
                               ─► ONE_TIME: set usedAt ─► transition ARMED→ADMITTED
                               ─► return { candidateToken, mediaToken, mediaUrl }
POST /candidate/media-ready    ─► media.provider.verifyTracks(sid) (cam, mic, screen=monitor) ─► Redis state mediaReady
```

### 6.3 Live loop (Data flows 01 and 03)

```
candidate socket                      SessionRuntime (single writer)                   interviewer socket
 tel.batch ───────► ingest.ts ───────► detectors ──► Observation(llr) ──┐
 editor.delta ────► ingest.ts ───────► authorship detector ─────────────┤
 internal API (cv/asr) ─────────────────────────────────────────────────┤
                                                                         ▼
                                            evidence.append (seq, prevHash, hash) → Postgres
                                                                         ▼
                                            fusion.engine (decay, corroboration, score)
                                                  │                 │
                                            flag-builder        200 ms tick
                                                  │                 │ every 2 s ──► integrity.tick ──► dashboard
                                                  ▼                 │ every 10 s ─► integrity_snapshots
                                         flags row + flag.new ──────┼─────────────────────────────────► dashboard
                                                  ▼
                                               warden ──► warnings row ──► warn.show ──► candidate
 warn.ack ─────────────────────────────────► warnings.acknowledgedAt, flag.update ────────────────────► dashboard
```

**SessionRuntime** (one per LIVE session, in memory):
- Acquires Redis lease `s:{sid}:lease` (`SET NX PX 5000`, renewed every 2 s). Without the lease it refuses to write.
- Serialises every input through one async queue → no races on `seq`, accumulators or flags.
- Checkpoints fusion state to `s:{sid}:fusion` every tick so a restarted process resumes.
- Owns timers: fusion tick 200 ms, integrity tick 2 s, snapshot 10 s, timer tick 1 s, calibration end 60 s,
  duration limit, grace timers.
- Destroyed after seal.

### 6.4 Fusion math (implementation contract)

All constants live in `src/config/detection.ts` and are **never** sent to clients.

1. **Observation → LLR.** Each detector emits `{channel, type, strength}`. `detection.ts` maps
   `(type, sensitivity) → llr`. Clean-behaviour observations may carry negative LLR.
2. **Decay per channel.** `A_c(t) = A_c(t₀) · exp(−(t − t₀) / τ_c) + llr`.
   `τ`: gaze 180 s, audio 300 s, scene 240 s, focus 300 s; others configured. Floor `A_c ≥ −2`.
3. **Corroboration.** When a positive observation arrives and `k` distinct *independent* channels have
   positive observations within the last 6 s, multiply its LLR by `min(2.35, 1 + 0.45 · (k − 1))`.
4. **Score.** `S = Σ w_c · A_c` over scored channels (unscored channels contribute 0).
   `integrity = min(100, 200 / (1 + exp(S / σ)))`, `σ` by sensitivity (LOW 6, STANDARD 4, HIGH 3).
5. **Flag emission.** When `A_c` crosses threshold `θ_c(sensitivity)` upward → create flag. Severity from
   `A_c` band. `scoreDelta = integrityBefore − integrityAfter` for the contributing observations.
6. **Merge.** Same `type` within 15 s of an open flag → extend `endTs`, `mergedCount++`, recompute delta, `flag.update`.
7. **Unscored windows.** Signal loss, QC gate, sequence gap, detector down, calibration → open window;
   channel frozen (no decay, no new evidence) until closed.
8. **Calibration.** First 60 s after LIVE: observations stored, baselines captured, **no flags, no warnings**.

### 6.5 Warden

- Tier: first occurrence of a type → `NOTICE` (HIGH severity → `WARNING`); second → `WARNING`;
  third or later → `INTERRUPT`.
- Cooldown 45 s per type (Redis `s:{sid}:warn`). Inside cooldown → no new warning (flag still recorded).
- Cap: once 6 warnings above tier 1 have been shown, further ones are downgraded to `NOTICE`.
- Message from a fixed template per type. Example: *"Multiple voices detected. Please ensure you are alone
  for the rest of the interview."* Never *"Cheating detected"*.

### 6.6 Grace periods and signal loss

| Signal | Grace | During grace | After grace |
|---|---|---|---|
| Camera track | 15 s | clock frozen, camera channels unscored | window stays unscored until track returns |
| Screen track | 10 s | clock frozen, screen channel unscored | same |
| Candidate socket | 120 s | clock frozen, all client channels unscored | session ends as `candidate_abandon` → SEALING |

No disconnection, drop or gap ever produces a positive LLR.
A client reporting an impossible state (e.g. continuous visibility while the SFU reports the screen track muted)
writes a `data_integrity` audit note, not a conduct flag.

### 6.7 Seal (Workflow 02, step 1)

Implemented in `seal.service.ts` as numbered, idempotent steps. Progress stored in Redis `s:{sid}:seal`
(`step: n`), so a crash resumes at the next step.

1. CAS `LIVE → SEALING`.
2. Drain in-flight input for 5 s.
3. Emit `session.ended` to candidate (thank-you payload, identical for everyone).
4. Stop recording egress; wait for storage finalise (timeout → recording marked FAILED, continue).
5. Detach producers (mark heartbeats stopped, reject further internal ingest).
6. Fusion final tick; close all open unscored windows and flags.
7. Stream all evidence (observations, flags, transcript, notes, executions) in `seq` order to
   `evidence/events.ndjson.gz`; recompute and verify the hash chain.
8. Build `manifest.json` (chain head, last seq, detector versions, weights version, checksums); sign
   with Ed25519; store `manifest.sig`; INSERT `evidence_manifests`.
9. Transition `SEALING → PROCESSING`; enqueue pipeline flow.

### 6.8 Post-processing pipeline (Workflow 02, steps 2 to 6)

```
                    ┌─► TranscriptFinalize ─┐
SealVerify ─► ──────┼─► IntegrityRescore ───┼─► AnswerGrading ─► CompositeScore ─► RenderReport ─► deliver
                    ├─► CodeEvaluate ───────┤      (needs transcript)
                    └─► MediaIndex ─────────┘
```

- Built with BullMQ `FlowProducer`. Each step: `attempts: 3`, exponential backoff.
- Each step writes a `pipeline_step_runs` row (RUNNING → SUCCEEDED | FAILED).
- Parent steps use `failParentOnFailure: false`; a failed step is recorded and downstream steps run with
  whatever inputs exist. If any step FAILED → run status `DEGRADED`, `report.degraded = true`,
  `report.lostSteps = [...]`.
- Deliver: email summary (summary only) + publish `report.ready` + transition `PROCESSING → COMPLETE`.
- Without real ML/LLM: TranscriptFinalize and AnswerGrading use `MockLlmProvider`; IntegrityRescore re-runs
  the same fusion engine over stored observations + adjudications (that part is fully real).

### 6.9 Composite score

```
technical     = weighted mean of answer grades + code evaluation   (0–100)
communication = structure + specificity dimensions                 (0–100)   // never accent/fluency/pace/silence
I = integrity_final

if I >= 85:        M = 100
if 70 <= I < 85:   M = 100 * (I − 70) / 15
if I < 70:         composite = null, reviewRequired = true

composite = 0.55 * technical + 0.20 * communication + 0.25 * M
```

---

## 7. Data and storage

### 7.1 PostgreSQL
All tables are defined in `prisma/schema.prisma`. Groups: orgs/auth, setup, join, live evidence, coding,
seal & post-processing, audit.

Append-only tables (no UPDATE/DELETE from app code except retention job): `observations`,
`flag_adjudications`, `audit_logs`, `consents`.

### 7.2 Redis keys (live only, TTL 8 h unless stated)

| Key | Type | Purpose |
|---|---|---|
| `s:{sid}:state` | hash | `mediaReady`, `startedAt`, `calibrationEndsAt`, `clockFrozen`, `pausedMs` |
| `s:{sid}:lease` | string | fusion single-writer lease (PX 5000) |
| `s:{sid}:fusion` | string (JSON) | accumulator checkpoint |
| `s:{sid}:chain` | hash | `lastSeq`, `lastHash` |
| `s:{sid}:buf` | list | last 2000 outbound dashboard frames (LTRIM) |
| `s:{sid}:warn` | hash | per-type `lastShownAt`, `count`, global `aboveTier1` |
| `s:{sid}:conn:{connId}:seq` | string | last accepted telemetry seq per connection |
| `s:{sid}:producers` | hash | producer → last heartbeat |
| `s:{sid}:seal` | hash | seal step progress (TTL 7 days) |
| `rl:*` | — | rate limiter |
| `bull:*` | — | BullMQ |
| `events:{sid}` | pub/sub channel | worker → api notifications |

### 7.3 Object storage layout

```
orgs/{orgId}/sessions/{sid}/
├── jd/original.{pdf|docx|txt}
├── recordings/composite.mp4
├── recordings/hls/…
├── frames/{flagId}/{n}.jpg
├── code/{sessionTaskId}/{snapshotId}.txt
├── evidence/events.ndjson.gz
├── evidence/manifest.json
├── evidence/manifest.sig
└── reports/report.html, report.pdf
```

(The spec says `.zst`; gzip is used because it ships with Node. Swap later if needed.)

### 7.4 Hash chain

```
genesis   = sha256("veritrust:" + sessionId)
hash[n]   = sha256(prevHash[n] + canonicalJson({ sessionId, seq, source, channel, type, ts, payload }))
prevHash[n] = hash[n−1]   (prevHash[1] = genesis)
```
`canonicalJson` = keys sorted recursively, no whitespace, dates as ISO strings.

---

## 8. Authentication and authorisation

| Principal | Token | Where verified | Scope |
|---|---|---|---|
| User | Access JWT (15 min) `{sub, orgId, role}` in `Authorization: Bearer` | `middlewares/auth.ts` | org-scoped REST + `/interviewer` socket |
| User | Refresh token (opaque, hashed in DB, rotating) in httpOnly cookie | `auth.service` | `/auth/refresh` only |
| Candidate (pre-consent) | Join JWT `{jti, sid, kind}` in URL | `middlewares/join-token.ts` | `/join/:token/*` |
| Candidate (post-consent) | Candidate JWT `{sid, consentId, aud:"candidate"}` (duration + 2 h) | `middlewares/candidate-token.ts` | `/candidate/*` + `/candidate` socket |
| Producer | Static service token (`INTERNAL_SERVICE_TOKEN`) | `middlewares/service-token.ts` | `/internal/*` |
| Media server | LiveKit webhook signature | `webhook.routes.ts` | `/webhooks/livekit` |

Session access for users: user is a member of `session.orgId` **and** (bound interviewer **or** role
OWNER/ADMIN/REVIEWER). Every Prisma query for org data includes `orgId` in its `where`.

---

## 9. Environment variables

```
NODE_ENV=development
PORT=9000
APP_URL=http://localhost:3000            # Next.js frontend (links in emails)
API_URL=http://localhost:9000
CORS_ORIGINS=http://localhost:3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/veritrust
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=
JWT_REFRESH_TTL_DAYS=30
JOIN_TOKEN_SECRET=
CANDIDATE_TOKEN_SECRET=
HASH_PEPPER=                              # HMAC key for ip/ua hashing
INTERNAL_SERVICE_TOKEN=
EVIDENCE_SIGNING_PRIVATE_KEY=             # Ed25519 PEM (base64)
EVIDENCE_SIGNING_KEY_ID=local-dev-1

STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=./storage

LLM_PROVIDER=mock
MEDIA_PROVIDER=mock                       # mock | livekit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
SANDBOX_PROVIDER=mock                     # mock | docker

SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM="VeriTrust <no-reply@veritrust.local>"

REPORT_PDF_ENABLED=false
```

---

## 10. Local development

```bash
docker compose up -d        # postgres, redis, mailpit
npm run db:migrate
npm run dev                 # api on :9000
npm run worker              # workers
npm test
```
