# VeriTrust cloud cost audit (managed deployment)

Scope: managed Postgres, managed Redis, container hosting for the API and worker processes, assuming
100 / 1,000 / 10,000 daily active users (DAU). Read-only audit of `/Users/yashgupta/Desktop/veritrust`.
Every structural claim below is cited to a file and line. Where I inferred rather than read something,
or didn't check it at all, that's called out explicitly.

## Fix-before-relying-on-this-cost-model (read this first)

These aren't cost estimates, they're things that will make any cost model wrong or that will fail
outright under the "managed container hosting" assumption in the brief. Flagging only, not fixing.

1. **Session-scoped Redis keys are never deleted or TTL'd, except one.** `s:{sid}:buf` (2000-entry
   dashboard replay list), `s:{sid}:frameseq`, `s:{sid}:chain` (evidence hash-chain head), `s:{sid}:state`,
   and one `s:{sid}:conn:{connId}:seq` per candidate connection are all written and never cleaned up —
   `backend/src/sockets/emitter.ts:14-15`, `backend/src/services/evidence.service.ts:23-25`,
   `backend/src/services/media.service.ts:12`, `backend/src/live/ingest.ts:38-40`. The only per-session
   key with a TTL is `sealProgress` (`backend/src/services/seal.service.ts:26`); the only key ever
   explicitly deleted is the fusion lease, on `destroy()` (`backend/src/live/session-runtime.ts:441`).
   Every interview session ever run leaves permanent Redis residue. At 10,000 DAU this is thousands of
   orphaned keys a day, forever, with no code path that reclaims them. This either grows the managed
   Redis memory bill indefinitely or, if the instance has `maxmemory-policy` eviction enabled to cope,
   risks evicting a live session's lease/chain-head key under memory pressure — which would corrupt that
   session's hash chain (see finding 4 below in the main body). I did not check whether any external/infra
   config (outside this repo) runs a `redis-cli SCAN`-based reaper; I found nothing in the app code.

2. **Storage provider is hard-coded to local disk — `STORAGE_PROVIDER: z.enum(["local"])`**
   (`backend/src/config/env.ts:45`), and `getStorage()` always constructs `LocalStorageProvider`
   (`backend/src/providers/index.ts:23`, only implementation at `backend/src/providers/storage/local.storage.ts`).
   No S3/GCS/object-storage provider exists in the codebase. The Dockerfile itself flags this:
   *"Local disk storage (STORAGE_PROVIDER=local, the only provider built so far) needs a writable, and
   in production persistent, directory. Mount a volume at this path"* (`backend/Dockerfile:45-49`). Sealed
   evidence exports (`exportEvidenceLog`, `backend/src/services/evidence.service.ts:205-217`), manifests,
   signatures, and generated reports all go to this local path. On typical managed container hosting
   (Cloud Run, Fargate, etc.) container filesystems are ephemeral and not shared across replicas — a
   report or evidence file written by the instance that sealed a session would be unreadable from a
   request served by a different replica, and gone entirely after a restart/redeploy. Before this can run
   on more than a single persistent instance (or before costs can be modeled honestly), this needs either
   a real object-storage provider or a shared network filesystem (e.g. EFS/Filestore), both of which are
   real, non-trivial infra additions the "managed deployment" framing in the brief doesn't already include.

3. **The Docker code-execution sandbox needs a real Docker daemon reachable from the API process** —
   `backend/src/providers/sandbox/docker.sandbox.ts` uses `dockerode` to `createContainer`/`start`/`logs`
   directly (lines 85-192), invoked synchronously in the candidate-facing `POST /candidate/tasks/:id/run`
   request path (`backend/src/services/coding.service.ts:39-49`, route at
   `backend/src/routes/candidate.routes.ts:25`). This requires either a mounted Docker socket or
   Docker-in-Docker on whatever host runs the API/worker container — most managed container platforms
   (Cloud Run, Fargate, etc.) don't permit this without privileged mode or a dedicated node pool, which
   pushes the deployment toward always-on VMs/dedicated instances rather than the scale-to-zero container
   pricing the "managed container hosting" framing implies. `SANDBOX_PROVIDER` defaults to `"mock"`
   (`backend/src/config/env.ts:57`); this only bites when `docker` is selected for a real deployment.

None of these are active incidents in this repo (nothing is currently deployed per the git history), but
all three change the shape of "managed deployment" enough that any cost number below should be read as
conditional on solving them first.

## What the code actually is (verified against disk)

- Runtime: Node **22** (not 24) — `backend/Dockerfile:7` (`node:22-bookworm-slim`), `backend/package.json`
  `engines.node: ">=22"`.
- Postgres **17** — `backend/docker-compose.yml` (`image: postgres:17`). Confirmed.
- Redis **7** (alpine) — `backend/docker-compose.yml` (`image: redis:7-alpine`). Confirmed.
- ioredis, BullMQ, socket.io, rate-limit-redis, express-rate-limit — confirmed in `backend/package.json`
  (`ioredis ^6.0.0`, `bullmq ^6.3.6`, `socket.io ^4.8.3`, `rate-limit-redis ^6.0.1`).
- **No `@socket.io/redis-adapter` (or any socket.io adapter package) is installed.** Checked
  `backend/package.json` directly — absent. Combined with `registry` being a plain in-process `Map`
  (`backend/src/live/registry.ts`), the live session pipeline (`SessionRuntime`, telemetry ingest, fusion,
  socket delivery in `backend/src/sockets/index.ts`) is pinned to whichever single API process accepted
  that session's sockets. A worker-side event *can* reach any API instance via the `events:{sid}` Redis
  pub/sub channel (`backend/src/utils/events.ts`, subscribed in `backend/src/sockets/event-subscriber.ts`),
  but the primary path — telemetry ingest, timer ticks, fusion, flag emission — calls `emitToInterviewers`
  directly in-process (`backend/src/live/session-runtime.ts:142`, `:177`) and never goes through that
  channel. Practical effect: you cannot round-robin-load-balance the API tier across replicas for live
  sessions without session-affinity routing keyed by session ID (ordinary sticky-by-cookie/IP isn't
  enough, since both the candidate socket and every interviewer socket for one session must land on the
  same process). This pushes the API tier toward fewer, larger instances rather than elastic horizontal
  scaling — a real cost-shape decision, not just a scaling nicety.
- Ed25519 evidence hash chain — confirmed, chain head stored in Redis (`s:{sid}:chain`, hash+seq via
  `HMGET`/`HSET`), append logic in `backend/src/services/evidence.service.ts:31-85`.
- Docker sandbox for candidate code execution — confirmed, see flag 3 above.
- nodemailer with a log provider, mock-only LLM/media providers — I did not deep-audit these; they're
  explicitly out of scope per the brief and I only confirmed the mock/log defaults exist
  (`backend/src/config/env.ts:57` sandbox, `providers/llm/mock.llm.ts`, `providers/media/mock.media.ts`).
  Real LLM/media provider costs (video SFU/recording egress, transcription, real LLM calls) are **not
  modeled in this audit** because there is no real implementation on disk to read costs from — this is a
  meaningful blind spot: video infrastructure is very likely to be the single largest external cost in a
  real deployment, and it's entirely unaudited here.
- `ml/` — a separate Python offline calibration/eval lab. I did not check it; it isn't a runtime service
  and doesn't factor into an online cost model.

## What drives cost: Redis operations per session-second

The dominant, structural finding: **a live session burns Redis operations on a fixed per-second cadence
driven by timers, independent of whether the candidate is doing anything.** This is a duration-scaling
cost, not a DAU-scaling one — see the "duration vs. count" section below.

Per `SessionRuntime.start()` (`backend/src/live/session-runtime.ts:108-118`), four intervals start the
moment a session goes LIVE and run for the full `durationMinutes` (default 60,
`backend/prisma/schema.prisma:339`):

| Interval | Period | Constant | Defined at | Redis ops per firing |
|---|---|---|---|---|
| Timer tick → `emitToInterviewers` | 1 s | `TIMER_TICK_MS` | `constants.ts:34` | 3 (`INCR` + `LPUSH` + `LTRIM`) |
| Fusion lease renewal | 2 s | `FUSION_LEASE_RENEW_MS` | `constants.ts:33` | 1 (`SET`) |
| Integrity tick → `emitToInterviewers` | 2 s | `INTEGRITY_TICK_MS` | `constants.ts:60` | 3 |
| Integrity snapshot (Postgres, not Redis) | 10 s | `INTEGRITY_SNAPSHOT_MS` | `constants.ts:62` | 0 (1 Postgres `INSERT`) |
| Producer health check | 5 s | `PRODUCER_HEALTH_CHECK_MS` | `constants.ts:54` | 0 unless a producer is degraded |

`emitToInterviewers` itself is `redis.incr(seqKey)` + `redis.lpush(bufferKey)` +
`redis.ltrim(bufferKey, 0, 1999)`, three round trips per call
(`backend/src/sockets/emitter.ts:21-30`, buffer cap `DASHBOARD_FRAME_BUFFER_SIZE=2000` at
`constants.ts:37`).

Doing the arithmetic from these three lines alone: 1 tick/s × 3 ops + 0.5 lease-renewals/s × 1 op +
0.5 integrity-ticks/s × 3 ops = **5 Redis ops/second, continuously, per LIVE session, with zero candidate
activity.** That's ~18,000 Redis ops/hour per session before a single telemetry event is processed.

On top of that floor, candidate telemetry adds more. The repo's own load-test script states the target
rate explicitly: *"1 session × 4 events/s × 60 min"*, because the browser's `TelemetryReporter` flushes
its queue every `BATCH_INTERVAL_MS = 250 ms` when non-empty
(`backend/scripts/load-test-telemetry.ts:1-17`; batch cadence confirmed independently at
`frontend/lib/candidate/telemetry.ts:176,31`). Each `tel.batch` arrival goes through
`TelemetryIngest.acceptBatch` (`backend/src/live/ingest.ts:22-36`), which is a `GET` + `SET` per batch
(2 Redis ops) purely for per-connection sequence dedup — before any detector even runs. At the stated
4 batches/s this is another **8 Redis ops/second** while telemetry is flowing, i.e. most of the session
for an engaged candidate. Combined floor: **~13 Redis ops/sec ≈ 47,000 Redis ops per 60-minute session**,
before counting the extra `HMGET`+`HSET` pair the hash chain does per `appendObservations` call whenever
a detector actually fires (`backend/src/services/evidence.service.ts:31-38,82-83`) or the additional
`emitToInterviewers` calls fired on every flag crossing (`backend/src/live/fusion/flag-builder.ts`) and
warden warning (`backend/src/live/warden.ts`) — both of which scale with how eventful the session is, i.e.
also with duration and with how aggressively the fusion/detector tuning fires.

This all runs from a single serialized write queue per session (`backend/src/live/session-runtime.ts:99,
238-242`), so it's not parallel load — it's a steady drip, but a drip that never stops for the length of
the interview.

**rate-limit-redis**: one `RedisStore` command sequence per rate-limited HTTP request
(`backend/src/middlewares/rate-limit.ts:15-37`), applied broadly via `apiLimiter` (300 req/60s,
`rate-limit.ts:40`) plus the tighter per-candidate `code-run` limiter (1 per 3s per session+task,
`CODE_RUN_RATE_LIMIT_MS=3000` at `constants.ts:84`, wired at `backend/src/routes/candidate.routes.ts:15-19,25`).
This scales with request count (interviewer dashboard polling, candidate API calls), not duration — minor
relative to the telemetry/tick floor above.

## Rows written per session (Postgres)

Row-count growth also splits into "per session" (bounded, scales with DAU) and "per session-second"
(scales with duration). From `backend/prisma/schema.prisma` and the services that write to it:

- **Observation** — one row per detector output, batch-inserted via `createManyAndReturn`
  (`evidence.service.ts:82`), each carrying `prevHash`/`hash` for the chain
  (`schema.prisma:556-577`). Volume is a function of how many telemetry events cross a detector
  threshold, which in turn scales with session duration and how many channels are enabled.
- **IntegritySnapshot** — one row every 10 s per session, unconditionally
  (`session-runtime.ts:184-194`, `constants.ts:62`). A 60-minute session writes 360 of these regardless
  of activity. **This table is never purged** (see retention section below) — pure duration × session-count
  growth with no ceiling.
- **EditorDelta** — batch-inserted every 500 ms of editor activity per coding task
  (`session-runtime.ts:319-338`, `DELTA_INTERVAL_MS=500` at `frontend/lib/candidate/telemetry.ts:254`).
  `text` is only populated for paste-type changes and capped at 10,000 chars
  (`frontend/components/candidate/candidate-editor.tsx:112,117`), so this isn't as bad as "full keystroke
  log," but it's still a steady per-500ms-of-typing row stream, unbounded by retention (see below).
- **CodeSnapshot** — one row every 30 s per active coding task (`SNAPSHOT_INTERVAL_MS=30_000`,
  `telemetry.ts:255`), plus one on every `run`/`submit` (`session-runtime.ts:357-364`,
  `coding.service.ts:70-73`). Stores full `content` (the whole solution text) each time — this is real
  row-size growth, not just row-count.
- **CodeExecution** — one row per `run` and per `submit`, storing the full `code`, `stdout`, `stderr`,
  and results JSON (`schema.prisma:775-797`, writes at `coding.service.ts:53,111`). Bounded by the
  `code-run` rate limiter (1 per 3 s per task) and by however many tasks/submits a session has — this one
  scales with session *count* more than duration, since it's action-gated.
- **Flag / FlagObservation / FlagAdjudication / Warning / UnscoredWindow** — event-driven off the fusion
  engine (`backend/src/live/fusion/flag-builder.ts`, `warden.ts`), so scales with how "flaggy" a session
  is, which correlates with duration and sensitivity settings but isn't a fixed per-second cost.
- **AuditLog** — one row per audited action, including every retention deletion
  (`backend/src/services/retention.service.ts` calls `auditService.log` in every purge function) — grows
  with both usage and with the retention job itself.

## Socket fan-out to interviewers

Scoped, not broadcast. Every dashboard event is emitted with `.to(`session:${sessionId}`)`
(`backend/src/sockets/emitter.ts:28`), and joining that room requires passing `hasSessionAccess`
(privileged org roles, or an explicit `SessionInterviewer` binding —
`backend/src/sockets/index.ts:24-30,53-78`). So an interviewer's dashboard only receives frames for
sessions they're actually assigned to (or any session, if they hold a privileged org role like
OWNER/ADMIN/REVIEWER — `PRIVILEGED_ROLES` at `sockets/index.ts:22`), not every candidate's raw feed
org-wide. I did not find evidence that raw video/audio frames flow through this socket layer at all —
`backend/src/services/media.service.ts` only starts/stops an external recording egress
(`startRecordingIfConfigured`, lines 21-43) via `getMedia()`, and the mock media provider doesn't touch
storage or sockets. Real video delivery (candidate → interviewer live view) is presumably handled by
whatever real media/SFU provider replaces the mock — **entirely unaudited here, no real implementation
exists on disk to read.** What *does* flow over `/interviewer` sockets is small JSON: timer ticks,
integrity ticks, flags, warnings, notes, suggestions — cheap per-message, but frequent (see the Redis
table above, since every one of these also writes into the 2000-frame Redis replay buffer).

## Retention: what's covered and what isn't

There is a real, scheduled retention job — nightly via BullMQ (`RETENTION_CRON` default `"0 3 * * *"`,
`backend/src/config/env.ts:71`, scheduled at `backend/src/worker.ts:38-42`) — and it is genuinely wired up,
not just configured. `backend/src/services/retention.service.ts` purges exactly four things:

| Category | Window (env default) | What's removed |
|---|---|---|
| Media | `RETENTION_MEDIA_DAYS=90` | Recording bytes + pointers (`purgeMedia`, lines 28-53) |
| Observations | `RETENTION_OBSERVATIONS_DAYS=180` | Raw `Observation` rows (`purgeObservations`, lines 58-79) |
| Evidence event log | `max(observations, RETENTION_EVIDENCE_LOG_FLOOR_DAYS=30)` | The gzipped ndjson export only, not the manifest/signature (`purgeEventLogs`, lines 87-108) |
| Reports + transcripts | `RETENTION_REPORTS_DAYS=1095` | `Report` rows + files, `TranscriptSegment` rows (`purgeReportsAndTranscripts`, lines 111-138) |

Everything else in the schema has **no retention path at all** — I grepped the whole service and this is
the complete list of four `purge*` functions. Not purged, ever: `Flag`, `FlagObservation`,
`FlagAdjudication`, `Warning`, `UnscoredWindow`, `IntegritySnapshot`, `EditorDelta`, `CodeSnapshot`,
`CodeExecution`, `AuditLog`, `QuestionSuggestion`, `Note`, `PipelineRun`/`PipelineStepRun`, `QAPair`,
`AnswerGrade`, `CodeEvaluation`, `EvidenceManifest` (row + signature/manifest files). Several of these
(`IntegritySnapshot`, `EditorDelta`, `CodeSnapshot`, `CodeExecution`) are exactly the ones I identified
above as writing steadily throughout a session's duration and carrying real payload size (full code
text, JSON blobs). This is unbounded Postgres storage growth that compounds with total sessions ever run,
not just active DAU — the kind of thing that looks fine in a demo and shows up as a surprising storage
line item a year in.

`DEFAULT_RETENTION_DAYS = 90` (`constants.ts:19`) is explicitly a display-only value — its own comment
says *"the actual per-data-type periods live in Phase 11's retention job"* — so it isn't itself a second
source of truth, just UI copy.

## Cost estimate at 100 / 1,000 / 10,000 DAU

I could not find any deployment config, infra-as-code, or hosting docs in this repo describing actual
target instance sizes or a managed-service tier — I did not check for one outside the repo (e.g. Terraform
in a separate infra repo), so all $ figures below are back-of-envelope, built only from the mechanics
above, using standard current list pricing for managed Postgres/Redis/container CPU-hours as of this
writing. Treat these as order-of-magnitude, not quotes.

**Assumptions (explicit, not read from code):** each DAU takes exactly one ~60-minute interview per day
(schema default `durationMinutes=60`); interviews are spread across an 8-hour scheduling window, so
average concurrent LIVE sessions ≈ DAU / 8, with a 2-3x peak-clustering multiplier for busy-hour bursts.
I did not find any code that caps concurrent LIVE sessions, so nothing in the app itself smooths this out.

| | 100 DAU | 1,000 DAU | 10,000 DAU |
|---|---|---|---|
| Avg concurrent LIVE sessions | ~13 | ~125 | ~1,250 |
| Peak concurrent LIVE sessions (2.5x) | ~30 | ~310 | ~3,100 |
| Redis ops/sec at avg concurrency (13 ops/sec/session floor) | ~170 | ~1,600 | ~16,000 |
| Redis ops/sec at peak | ~400 | ~4,000 | ~40,000 |
| Postgres rows/day from `IntegritySnapshot` alone (360/session) | 36,000 | 360,000 | 3,600,000 |
| Docker sandbox container spawns/day (bounded by 1-per-3s-per-task limiter, not modeled further) | low | low-moderate | needs dedicated capacity, see flag 3 |

At these op counts, **managed Redis compute is not the dominant cost** at any of these three tiers — even
the 10,000-DAU peak (~40k ops/sec) sits comfortably inside a mid-tier managed Redis instance's throughput
budget, assuming small payloads (which these mostly are: ints, short JSON envelopes). The risk at that
tier is Redis **memory**, not throughput — driven by finding 1 above (unbounded per-session key growth)
and by the 2000-frame replay buffer per session (`DASHBOARD_FRAME_BUFFER_SIZE`, `constants.ts:37`) that,
combined with never being deleted, becomes a permanently-growing floor under the instance's memory
footprint. Managed Postgres cost is driven mainly by storage growth from the unretained tables above, not
by write IOPS at these session counts — 3.6M `IntegritySnapshot` rows/day at 10,000 DAU, forever, is a
storage-planning problem, not a performance one, until someone notices the table is enormous.

Container hosting cost is capped less by CPU/request volume and more by the architectural constraints in
the top section: no horizontal scaling for the live-session path without session-affinity routing, no
shared storage for multi-replica deployment, and a Docker-execution sandbox that needs privileged/DinD
capability. In practice this likely means running the API/worker tier as a small number of large,
always-on instances rather than an elastic fleet — which is a **flat cost floor that doesn't shrink with
low DAU** and a **step-function, not smooth, cost curve as you outgrow one instance's session-affinity
capacity.**

## What scales with duration, not session count

This is the finding the brief specifically asked to watch for, so to state it plainly: **the single
biggest cost-shape risk in this codebase is that per-session Redis and Postgres load is dominated by
fixed-interval timers (1s/2s/2s/10s) that run for the full scheduled `durationMinutes`, not by how much
the candidate actually does.** A product change that lengthens the default interview (e.g. a 4-hour
take-home-in-a-tab format, or interviewers routinely extending sessions) would roughly 4x the Redis op
count and `IntegritySnapshot`/`EditorDelta`/`CodeSnapshot` row counts **per session**, with zero change to
DAU. Nothing in the code scales these intervals down for longer sessions. Combined with the unbounded
per-session Redis key retention (finding 1) and the four-of-twenty-ish tables actually covered by data
retention, this system's cost is more sensitive to "how long are sessions" and "how long has this been
running in production" than to "how many people used it today" — exactly the kind of thing that doesn't
show up in a DAU-based cost projection until it's already a large bill.

## Not checked

- `ml/` Python component — confirmed out of scope (offline lab), not read in detail.
- Real LLM/media/SFU provider costs — no real implementation exists on disk; only mocks. This is likely
  the largest real-world cost component in a live-video interview product and is completely unmodeled
  here.
- Any infra-as-code, Terraform, or hosting docs outside this repo describing actual instance sizing.
- Frontend Next.js hosting cost (build output, ISR/SSR behavior, edge vs. node runtime) — not reviewed at
  all; this audit focused on the backend/Redis/Postgres path per the brief's framing.
- Nodemailer/log email provider cost — confirmed it's a log provider (no real send path reviewed), assumed
  zero cost, not further audited.
- Whether any external cron/ops tooling reaps orphaned Redis keys outside the application code (see
  finding 1) — I only checked the application source.
