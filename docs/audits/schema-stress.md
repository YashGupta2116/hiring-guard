# Schema stress test: VeriTrust

Audit 1 of 6. Read-only. No file other than this report was created or changed.
Repo state audited: `main` at `f3b7b4d`, working tree clean for `backend/prisma` and `backend/src`.
Re-checked against `f4f7462` after other authors' commits landed; see the update note below.

Paths below are relative to the repo root. `file:line` cites are to the code as it is on disk at
`f4f7462` (cites into files that shifted were refreshed).

## Read this first

**Update for `f4f7462`.** After I wrote this report, five commits from other authors landed on
`main` (browser-side camera analysis, WebRTC signalling, client lockdown, a `local` sandbox
provider, a rename to HiringGuard, audits 4 to 6). I re-read the backend diff against this report.
No finding F1 to F15 is invalidated. Four statements are affected:

- Section 2.2 said no CV producer existed. One now does, in the candidate's browser
  (`frontend/lib/candidate/cv.ts`), reporting through `cv.batch` (at most 20 items per message,
  `backend/src/sockets/events.ts:41-54`; no rate limit; `payload` unbounded). The corrected bullet is
  in section 2.2. F11 stands.
- Every `tel.batch` now also does a Redis `HSET` of `telemetrySeen`
  (`backend/src/sockets/index.ts:164`): one more Redis command per telemetry batch.
- A session ended with no telemetry, or after under 60 seconds, is now discarded: ABORTED with
  `endReason = "no_participation"`, no seal and no manifest
  (`backend/src/services/lifecycle.service.ts:97-124`). Its observations, if any, stay and follow the
  same `endedAt`-based retention. The discard decision itself depends on a Redis flag, which is the
  same family of risk as F1 (see `security.md`, CT-9).
- Transcripts (F6) are unchanged: still no ASR producer anywhere in the repo.

**Urgent, for your decision (not acted on): F1.** The evidence hash chain keeps its sequence
counter and last hash only in Redis. If that key is lost, or a Redis write fails at the wrong
moment, every later observation for that session is silently dropped, and the seal step signs
the truncated chain as valid. By reading, this is reachable from a Redis crash, a failover to a
replica, a flush, or a single transient Redis error at the wrong instant, no attacker needed.
Details in F1. Nothing else in this report needs to be fixed before launch
traffic, but F2 is a one-line index that is cheapest to add while the table is empty.

Headline answers:

- **Observations are not the table that will hurt first.** Observation rows are written per
  detector event, not per frame, and the current client produces roughly 300 per session. The
  tables that grow fastest are `editor_deltas` (one row per keystroke), `integrity_snapshots`
  (one row per 10 seconds, unconditionally), and, once an ASR producer exists,
  `transcript_segments` (one row per ~300 ms partial).
- **Observations do blow up on one path:** the authorship detector emits `typed_ratio_low` once
  per editor change after a paste (F4). That is the sessions the product exists to catch.
- **None of the three fastest-growing tables is ever purged.** Retention covers a minority of
  tables and contradicts what the candidate is told (F8).
- **Deletes are a latent failure.** Two missing foreign-key indexes (F2, F3) make cascading
  deletes and the nightly observation purge scan whole tables.
- **The database does not enforce append-only.** It is a convention (F9).

How this was done: I read the schema, all three migrations, and every service, worker, socket
handler and pipeline step that writes to it (a few small ones by grep only, listed in section 4).
I ran nothing against a database: no `EXPLAIN`, no row counts, no measured sizes. Every volume
figure is computed from code paths and stated assumptions, and marked as an estimate.

---

## 1. The schema as it exists

### 1.1 Shape

- PostgreSQL 17 (`backend/docker-compose.yml`), Prisma 7.10 with the `pg` driver adapter
  (`backend/src/utils/prisma.ts:5`). 36 models, 29 native Postgres enums, 3 migrations
  (`init`, `refresh_token_family`, `candidate_profile`).
- No partitioning, triggers, rules, roles or grants in any migration (grepped
  `TRIGGER|RULE|REVOKE|PARTITION|GRANT`: no matches).
- Primary keys: `cuid()` text for most tables, `ses_<ulid>` text for `interview_sessions`,
  `BIGSERIAL` for `observations`, `integrity_snapshots`, `editor_deltas`, `audit_logs`.
- Postgres-specific features in use: native enums, `JSONB`, `text[]` and enum arrays
  (`channels`, `skills`, `evidenceFrameUris`), one raw SQL query using `unnest` and `ILIKE`
  (`backend/src/services/candidate-directory.service.ts:119`).
- `ml/` does not touch the database (no DB driver in `ml/pyproject.toml` or `ml/src`; one comment
  in `ml/src/vtml/wire.py` quotes the Prisma enum).

### 1.2 Table catalog

`C` = ON DELETE CASCADE, `R` = RESTRICT, `N` = SET NULL. "Indexes" lists everything beyond the
primary key, as deployed (verified against the migration SQL, not just `schema.prisma`).

| Table | PK | Foreign keys | Indexes |
|---|---|---|---|
| organizations | cuid | | unique(slug) |
| users | cuid | | unique(email) |
| org_members | cuid | org C, user C | unique(orgId,userId) |
| refresh_tokens | cuid | user C | unique(tokenHash), (userId), (familyId) |
| candidates | cuid | org C | unique(orgId,email), (orgId,status) |
| interview_sessions | ses_ulid | org C, createdBy user R, candidate N | (orgId,status), (scheduledAt) |
| session_interviewers | (sessionId,userId) | session C, user C | none |
| job_descriptions | cuid | session C | unique(sessionId) |
| coding_tasks | cuid | org C | (orgId) |
| session_coding_tasks | cuid | session C, task R | unique(sessionId,taskId) |
| question_bank_items | cuid | org C | (orgId,topic) |
| join_tokens | cuid | session C, createdBy user R | unique(jti), (sessionId) |
| preflight_checks | cuid | session C, joinToken C | (sessionId) |
| consents | cuid | session C, joinToken C | (sessionId) |
| observations | bigserial | session C | unique(sessionId,seq), (sessionId,channel,ts) |
| flags | cuid | session C | (sessionId,status) |
| flag_observations | (flagId,observationId) | flag C, observation C | none |
| flag_adjudications | cuid | flag C, reviewer user R | (flagId) |
| warnings | cuid | session C, flag N | (sessionId,type) |
| unscored_windows | cuid | session C | (sessionId) |
| integrity_snapshots | bigserial | session C | (sessionId,ts) |
| transcript_segments | cuid | session C | (sessionId,startMs) |
| question_suggestions | cuid | session C, acceptedBy user N | (sessionId,batchId) |
| notes | cuid | session C, author user R | (sessionId,ts) |
| editor_deltas | bigserial | session C, sessionTask C | (sessionTaskId,ts) |
| code_snapshots | cuid | session C, sessionTask C | (sessionTaskId,createdAt) |
| code_executions | cuid | session C, sessionTask C | (sessionTaskId,createdAt) |
| recordings | cuid | session C | unique(sessionId) |
| evidence_manifests | cuid | session C | unique(sessionId) |
| pipeline_runs | cuid | session C | (sessionId) |
| pipeline_step_runs | cuid | run C | unique(runId,step) |
| qa_pairs | cuid | session C | unique(sessionId,position) |
| answer_grades | cuid | qaPair C | unique(qaPairId) |
| code_evaluations | cuid | sessionTask C | unique(sessionTaskId) |
| reports | cuid | session C | unique(sessionId) |
| audit_logs | bigserial | org N, session N | (sessionId,createdAt), (orgId,createdAt) |

Sources: `backend/prisma/schema.prisma` (models at 235-970), `backend/prisma/migrations/*/migration.sql`.

### 1.3 Relationship shape

- `interview_sessions` is the hub. 22 tables hang off it with cascade, so deleting one session,
  or the owning organization, cascades through every evidence table. No code path deletes a
  session or organization today (no `interviewSession.delete` or `organization.delete` in
  `backend/src`), so this is latent.
- Four relations to `users` are `RESTRICT` (`InterviewSession.createdBy`, `JoinToken.createdBy`,
  `Note.author`, `FlagAdjudication.reviewer`), so a user who has created a session, note, link or
  adjudication can never be deleted. No user or candidate delete path exists in `backend/src`.
- `audit_logs` uses `SET NULL` on both parents, so a cascade delete of a session rewrites audit
  rows and detaches them from the thing they audit.
- Two parents on the coding tables: `editor_deltas`, `code_snapshots` and `code_executions`
  each carry both `sessionId` and `sessionTaskId`, although `sessionTaskId` already implies the
  session. Nothing enforces that the two agree (F13).

### 1.4 Foreign keys with no supporting index

Postgres does not index FK columns automatically and Prisma does not add them. Verified against
the migration SQL:

| Column | Cascade / action | Consequence |
|---|---|---|
| `flag_observations.observationId` | C from observations | F2: retention purge scans the table per deleted row |
| `editor_deltas.sessionId` | C from sessions | F3 |
| `code_snapshots.sessionId` | C from sessions | F3 |
| `code_executions.sessionId` | C from sessions | F3, plus a live query needs it |
| `interview_sessions.candidateId`, `.createdById` | N / R | candidate history lookups, user delete |
| `warnings.flagId` | N | flag delete |
| `notes.authorId`, `join_tokens.createdById`, `flag_adjudications.reviewerId` | R | user delete |
| `consents.joinTokenId`, `preflight_checks.joinTokenId` | C | join token delete |
| `question_suggestions.acceptedById` | N | user delete |
| `session_interviewers.userId`, `org_members.userId` | C | composite key leads with the other column |
| `session_coding_tasks.taskId` | R | unique leads with sessionId |

### 1.5 What the database enforces versus what is convention

- Enforced: FK integrity, uniqueness of `(sessionId, seq)` on observations, enum membership.
- Convention only: append-only on `observations`, `consents`, `flag_adjudications`, `audit_logs`
  (stated in `backend/CLAUDE.md` and `backend/docs/Rules.md`; `audit.service.ts:17` says so in a
  comment). No trigger, no `REVOKE`. `backend/docker-compose.yml` runs the app as the `postgres`
  superuser.
- Convention only: the hash chain itself. Rows carry `prevHash` and `hash`, but only
  `verifyChain` at seal and on `GET .../evidence/verify` checks them.

---

## 2. Simulation: 10,000 daily active users

### 2.1 Assumptions

These drive every number below. Change them and the numbers move proportionally.

- 10,000 sessions per day. If the 10,000 DAU count both candidate and interviewer, halve
  everything.
- 60 minutes per session (the schema default is `durationMinutes = 60`,
  `schema.prisma:339`), one candidate, one interviewer, one coding task active for 30 minutes,
  candidate typing about 40 percent of that time at 3 to 5 editor changes per second.
- Load is not flat: a 10 hour working window gives about 1,000 concurrent live sessions on
  average and I assume a peak of 2.5x, so about 2,500.
- Row sizes are estimated from column types in the migration DDL plus index entries. They are
  not measured.

### 2.2 What writes, and how often

"Driver" is what causes a write. Volumes are per 60 minute session.

| Table | Driver | Rows per session | Rows per day at 10k | Approx GB/day | Ever purged? |
|---|---|---|---|---|---|
| `editor_deltas` | one row per Monaco content change | ~3,000 (1,500-8,000) | ~30M (15M-80M) | ~6 | **No** |
| `integrity_snapshots` | timer, every 10 s, unconditional | 361 | 3.6M | ~1 | **No** |
| `code_snapshots` | timer, every 30 s per task, no dedupe, plus run/submit | up to 120+ | ~1.2M | 1-4 (TOAST-dependent) | **No** |
| `code_executions` | each run and submit, `code` and output stored whole | 5-30 | 50k-300k | small | **No** |
| `observations`, typical | detector events | ~300 | ~3M | ~1.7 | 180 days |
| `observations`, paste case | `typed_ratio_low` per change (F4) | 3,000-10,000 | +0.5M per 1% of sessions | | 180 days |
| `flag_observations` | one per observation that reaches fusion and merges or creates a flag | up to the observation count | same order | small | with observations |
| `transcript_segments` (design-implied, no producer exists) | one row per ASR partial, ~300 ms | ~6,300 | ~63M | ~17 | 3 years |
| `refresh_tokens` | one row per refresh, 15 min access TTL | n/a | ~240k | small | **No** |
| `warnings`, `flags`, `unscored_windows`, `audit_logs`, pipeline tables | events | tens | small | small | mostly no |

Evidence for the drivers:

- `editor_deltas`: the editor registers one push per Monaco change
  (`frontend/components/candidate/candidate-editor.tsx:107-121`), the client flushes every 500 ms
  (`frontend/lib/candidate/telemetry.ts:253,268`), and the server inserts one row per change in
  a single `createMany` (`backend/src/live/session-runtime.ts:326-338`).
- `integrity_snapshots`: `INTEGRITY_SNAPSHOT_MS = 10_000` (`backend/src/config/constants.ts:64`),
  scheduled at `session-runtime.ts:114`, written at `:184-194`, plus one more at seal
  (`backend/src/services/seal.service.ts:116`). It writes whether or not anything changed.
- `code_snapshots`: client timer every 30 s (`telemetry.ts:254,268-273`), server insert at
  `session-runtime.ts:357-364`. No comparison with the previous snapshot on either side.
  Validator allows `content` up to 200,000 characters (`backend/src/sockets/events.ts:165-170`).
- Observations: the rhythm detector emits `rhythm_normal` or `rhythm_anomaly` for every
  `keystroke_stats` event after calibration (`backend/src/live/detectors/rhythm.detector.ts:15-43`),
  and the client emits one per 5 second window when at least 2 keys were pressed
  (`telemetry.ts:32,177,198-228`). That caps rhythm at 720 per hour and about 360 for a 30 minute
  round. Focus, pointer, paste, screen, device and network events are edge-triggered and small.
  `raf_gap` events are accepted by the validator and consumed by no detector, so they cost no
  row.
- Transcript: `backend/src/services/internal.service.ts:62-94` inserts one row per segment,
  partial or final; `backend/docs/Design.md:355` documents partials at about 300 ms. No code in
  the repo calls this endpoint except tests (grepped `internal/sessions`).
- As first written this report said no producer existed for the CV observation path and that its
  row rate was undefined. That changed while I was working (see the update note under "Read this
  first"): a browser-side producer now sends `cv.batch` over the candidate socket. An honest client
  repeats each event type at most every 10 to 20 seconds
  (`frontend/lib/candidate/cv.ts:15,17,20,28`), roughly 0.3 rows per second in the worst honest
  case. The internal HTTP endpoint still accepts an unbounded `items` array (F11), and a hostile
  socket client has no rate limit.

### 2.3 The observation table specifically

Row size, estimated from `migration.sql:298-314`: about 360 bytes of heap (header, `bigint` id,
31 byte text `sessionId`, two enums, three timestamps, `llr`, JSONB payload, two 65 byte hex
hashes) plus three btree entries (primary key, unique `(sessionId,seq)`, `(sessionId,channel,ts)`)
for about 550 bytes all-in.

- Typical session, about 300 rows: 3M rows per day, about 1.7 GB per day. With 180 day retention
  that settles at roughly 540M rows and 300 GB, before any paste-heavy sessions.
- Each 1 percent of sessions that hit the F4 path adds about 500,000 rows per day.
- The two 64 character hex hashes are 130 of the 360 heap bytes, and `prevHash` is redundant with
  the previous row's `hash` (F13).
- Deletion is per session by `deleteMany` (`backend/src/services/retention.service.ts:67`), which
  at these volumes means hundreds of millions of dead tuples and heavy WAL, and it cascades into
  the unindexed `flag_observations.observationId` (F2).

### 2.4 Peak write rate and the connection pool

At the assumed 2,500 concurrent sessions, excluding transcripts and the paste path:

| Source | Statements per second |
|---|---|
| integrity snapshots | ~250 |
| code snapshots | ~83 |
| editor delta batches (about 500 typing sessions x 2 per second) | ~1,000 |
| observation inserts (rhythm) | ~100 |
| flag lookups for those observations | ~100 |
| **Total** | **roughly 1,500** |

With ASR partials at 3.3 per second while someone is speaking, transcripts alone would add about
4,100 single-row insert statements per second.

All of this goes through one `pg` pool per API process, and the pool is the default size of 10:
`prisma.ts:5` passes only `connectionString`, the adapter builds `new pg.Pool(config)`
(`backend/node_modules/@prisma/adapter-pg/dist/index.js:812`), and the pool default is
`max = 10` (`backend/node_modules/pg-pool/index.js:89`). Each statement auto-commits. At 2 to 5 ms per
commit that is a ceiling in the low thousands of statements per second per process, the same order
as the estimated steady load, so the pool is the first structural limit. The repo's only load
test drives one session at 4 batches per second for 60 minutes
(`backend/scripts/load-test-telemetry.ts:1-12`); nothing exercises concurrency, so the figures
above are unvalidated estimates.

### 2.5 Findings

Severity is my judgment. "Basis" says whether I read it, inferred it, or ran it (nothing was run).

#### F1. Chain head lives only in Redis; a miss or failed write silently stops all later evidence (Critical)

- Where: `backend/src/services/evidence.service.ts:31-38` (head read from Redis, defaults to
  `seq 0` and the genesis hash if the key is absent), `:82-83` (insert first, then `HSET`),
  `backend/src/live/session-runtime.ts:238-242` (a failed write is logged and dropped),
  `backend/prisma/schema.prisma:574` (`@@unique([sessionId, seq])` is the only backstop).
- Mechanism A, key missing or behind mid-session (Redis crash, failover to a replica that had
  not received the last write, flush, eviction): if the key is gone, the next batch computes
  `seq = 1`; if it is behind, the batch reuses a `seq` that already exists. Either way the insert
  violates the unique constraint and the whole batch fails. `HSET` never runs, so the head never
  advances and every later batch fails the same way. `docker-compose.yml` starts Redis with its
  default settings only (no AOF), and no other Redis configuration exists in the repo, so how
  much a crash loses in a real deployment is unknown.
- Mechanism B, insert succeeds and `HSET` rejects (`backend/src/utils/redis.ts:11` gives up after
  3 retries): Postgres is one batch ahead of Redis, the next batch collides, same permanent
  stall. The batch that succeeded also skips fusion, because the throw skips
  `applyFusionAndFlags`.
- Consequence: observations stop being recorded for the rest of the session and nothing tells
  the interviewer. Seal runs `verifyChain` over what exists (`seal.service.ts:123`), which passes,
  and signs a manifest that attests to a truncated but internally consistent chain. For a
  product whose value is tamper-evident evidence, silent truncation is the worst failure shape.
- Related: the chain, buffer, frame-sequence and warning keys are never deleted or expired. Only
  the lease is deleted (`session-runtime.ts:441`) and only the seal-progress key has a TTL
  (`seal.service.ts:26`).
- Basis: read from code, not reproduced. Needs a Redis event, not an attacker; anyone who can
  flush Redis gets it on demand (see the security audit).

#### F2. `flag_observations.observationId` has no index; the nightly purge cascades through it row by row (High, latent)

- Where: `schema.prisma:608-617`; DDL at `migrations/20260917114527_init/migration.sql:341-346`
  (primary key is `(flagId, observationId)`, no other index);
  `retention.service.ts:67`.
- Deleting observations fires the FK cascade once per deleted row as
  `DELETE FROM flag_observations WHERE "observationId" = $1`. With a composite key led by
  `flagId` that is a sequential scan per row, so the cost is roughly (observations deleted) x
  (rows in `flag_observations`). One paste-heavy session with 5,000 observations against a
  10M-row link table is about 5 x 10^10 row visits, and the job loops over every session past
  cutoff. It would not finish in a night and holds locks while it runs.
- Harmless today because the tables are tiny. Basis: read, plus standard Postgres FK behaviour
  (not run).

#### F3. The three coding tables have no `sessionId` index despite a cascading FK on it (High, latent, one live query)

- Where: `editor_deltas`, `code_snapshots`, `code_executions`: only `(sessionTaskId, ...)` is
  indexed (`schema.prisma:755,771,795`).
- Any delete of a session or organization scans `editor_deltas`, the largest table, once per
  session row (latent: no delete path exists).
- Live today: the seal-time evidence export queries `code_executions` by `sessionId` ordered by
  `createdAt` (`evidence.service.ts:172-176`), which no index serves, so each seal sequentially
  scans `code_executions`.
- Basis: read.

#### F4. `typed_ratio_low` fires once per editor change after a paste, driving observation, flag and Redis writes per keystroke (High)

- Where: `backend/src/live/detectors/authorship.detector.ts:62-73` (the check sits inside the
  per-change loop and has no "already reported" state), consumed at `session-runtime.ts:343-354`
  and `:200-227`, merged at `backend/src/live/fusion/flag-builder.ts:77-97`.
- After a solution of 200 or more characters with a typed ratio under 0.35, every following
  change emits an observation. Each one costs: one `observations` row, one `flags` SELECT
  (`flag-builder.ts:77-80`), one transaction with a `flags` UPDATE and a `flag_observations`
  INSERT (`:85-97`), and three Redis commands plus a socket emit for `flag.update`
  (`backend/src/sockets/emitter.ts:21-30`), all awaited in sequence on that session's serialized
  queue.
- The merge window slides on every update, so one flag absorbs the rest of the session and its
  row is rewritten (`mergedCount`, `endTs`, `scoreDelta`, `severity`, `updatedAt`) thousands of
  times.
- This is the path taken by exactly the sessions the product exists to catch, so it is not a
  rare edge. Fixing it changes scoring behavior (each observation adds its LLR), which is a
  product decision, not a plumbing one.
- Basis: read.

#### F5. Time-driven and keystroke-driven writers with no dedupe and no purge (High)

- `integrity_snapshots`: 361 rows per session regardless of activity, while the same score is
  already streamed to the dashboard every 2 s. `backend/docs/PRD.md:130` requires the 10 s
  persistence, so this one is a product requirement.
- `code_snapshots`: whole file every 30 s, sent and stored whether or not anything changed.
- `editor_deltas`: keystroke granularity; largest table by row count.
- None of the three is covered by `retention.service.ts` (F8).
- Basis: read; volumes are estimates.

#### F6. Transcript partials each get a row and are kept three years (High, design-implied)

- Where: `internal.service.ts:62-94`. One insert per segment; finals also run an UPDATE
  (`:66-71`) whose `startMs < endMs` predicate range-scans all earlier segments of the session
  via `(sessionId, startMs)`, so cost per final grows with session length. Partials that are
  never superseded stay as `isFinal = false` rows that finalization ignores
  (`backend/src/pipeline/steps/transcript-finalize.step.ts:38-41`), and retention removes them
  only at `RETENTION_REPORTS_DAYS = 1095` (`retention.service.ts:114-131`, `backend/src/config/env.ts:69`).
- No producer calls this endpoint outside tests, so this is what the design will do when an ASR
  producer exists, not what runs today.

#### F7. `refresh_tokens` grows without bound (Medium)

- Where: access token TTL is 15 minutes (`backend/src/utils/jwt.ts:5`); each refresh revokes one
  row and inserts another (`backend/src/services/auth.service.ts:117-145`); expiry is 30 days
  (`env.ts:40`). No code deletes rows (grepped `refreshToken.delete` and `deleteMany`: none) and
  `retention.service.ts` does not touch the table. Four btrees per row.
- Estimate: about 24 rows per active dashboard user per day (a refresh per 15 minutes over about
  6 hours; inferred from the TTL, I did not read the frontend refresh logic), so about 240k rows
  per day and about 88M per year at 10,000 users.

#### F8. Retention covers a minority of tables and disagrees with what the candidate is told (Medium)

- Purged: recording media pointers (90 d), observations (180 d), the exported event log object
  (30 d floor), reports and transcripts (1,095 d). `retention.service.ts:29-146`,
  `env.ts:66-69`.
- Never purged: `editor_deltas` (rows can hold pasted text of up to 10,000 characters,
  `events.ts:114`), `code_snapshots`, `code_executions`, `integrity_snapshots`, `flags`,
  `unscored_windows`, `warnings`, `notes`, `consents`, `preflight_checks`, candidate PII,
  `refresh_tokens`, `audit_logs`, pipeline tables.
- The consent screen says "Recordings and evidence are kept for up to 90 days"
  (`backend/src/services/join.service.ts:130`) and stores `retentionDays = 90` on each `Consent`
  row (`:180-193`). Nothing in `backend/src` reads that column back (grepped `retentionDays`:
  only those writes).
- This is a scale problem and a compliance exposure. I have not sized the second.

#### F9. The hash chain omits the score-bearing column, and the database does not enforce append-only (Medium)

- The hash covers `sessionId, seq, source, channel, type, ts, payload`
  (`evidence.service.ts:53-64`). `llr`, `clientTs`, `receivedAt` and `id` are outside it. The
  offline rescore reads `obs.llr` (`backend/src/pipeline/steps/integrity-rescore.step.ts:98-104`),
  so `UPDATE observations SET llr = ...` changes a candidate's score and the chain still
  verifies.
- Flags, adjudications, unscored windows and warnings are outside the chain. The manifest
  checksums the exported ndjson (`evidence.service.ts:223`), and verify does not compare that
  file to database rows.
- No trigger or `REVOKE` exists (section 1.5), so any holder of the application database
  credentials can rewrite any row.
- Exploitability belongs to the security audit; it is listed here because the fix is a format and
  privilege decision in the schema.

#### F10. One 10-connection pool serves every live session on the process (Medium)

- See section 2.4 for the pool evidence. Live writers hold a connection across multi-statement
  interactive transactions (`flag-builder.ts:85-97,102-120`).
- Per-session queues are unbounded promise chains (`session-runtime.ts:238-242`), so when the pool
  is the limit, work queues in memory instead of applying backpressure, and latency degrades with
  no signal. `backend/docs/PRD.md:203` sets a target of ingest to flag under 1 s at p95.
- Basis: read; the pool default confirmed in `node_modules`; load behavior inferred.

#### F11. Row counts per session are not bounded anywhere (Medium)

- No maximum length on `tel.batch` `events`, `editor.delta` `changes` or `keyIntervalsMs`
  (`events.ts:100-105,116,119-123`); no cap on the internal `observations` `items` array or its
  `payload` (`backend/src/validators/internal.schema.ts:11-19`); sandbox `stdout`, `stderr` and
  per-test output are stored uncapped (`backend/src/providers/sandbox/docker.sandbox.ts:104-122`,
  `backend/src/services/coding.service.ts:53-68,111-127`).
- The socket handlers for `tel.batch`, `editor.delta` and `editor.snapshot` have no rate limit
  (`backend/src/sockets/index.ts:161-181`). The server is built with only CORS options
  (`:41-43`), so the ceiling is Socket.IO's default per-message size, which I did not verify.
- A single candidate connection can therefore choose how many rows it writes. Exploitation is for
  the security audit; the schema consequence is that nothing bounds row growth by design.

#### F12. Whole-snapshot storage creates read amplification on the live dashboard (Low to Medium)

- `getSessionCode` returns every snapshot with full `content` and every execution for every task,
  unpaginated (`coding.service.ts:144-152`), and the live dashboard polls it every 5 s while the
  panel is enabled (`frontend/components/live-interview/candidate-panel.tsx:15,34`).
- Payload grows with session length: about 0.36 MB by the end of an hour at 120 snapshots of 3 KB,
  about 0.18 MB averaged. At 2,500 concurrent sessions with one open panel each that is about 500
  polls per second, roughly 90 MB per second from Postgres to the API. Estimate.

#### F13. Redundant and derived data (Low)

- `sessionId` on the three coding tables duplicates what `sessionTaskId` implies, costs about
  31 bytes per row and a second FK probe per insert on the largest table, and nothing checks the
  two agree.
- `CodeEvaluation.editTimeline` and `pasteMap` (`code-evaluate.step.ts:79-90`) re-encode every
  `editor_deltas` row as a JSON blob, roughly doubling storage for that data. (The report model
  does not embed them, `render-report.step.ts:98-103`.)
- `Observation.prevHash` equals the previous row's `hash`, and both are 64 character hex stored as
  text (65 bytes each). As `bytea` a hash is 32 bytes.

#### F14. Other unindexed FK columns and no erasure path (Low)

- The remaining columns in section 1.4. Low volume, they matter only for deletes and some joins.
- An interviewer cannot be deleted once they have sessions, notes, links or adjudications (four
  `RESTRICT` relations), and no delete or anonymize path exists for interviewers or candidates.
  A candidate delete would only null `interview_sessions.candidateId`, so the report would lose
  its subject.

#### F15. Export and verify read patterns degrade with row count (Low)

- `exportEvidenceLog` paginates five tables with `skip`/`take` (`evidence.service.ts:137-145`);
  `verifyChain` loads all of a session's observations into memory (`:103-111`); the offline
  rescore loads all observations plus flags with links (`integrity-rescore.step.ts:61-65`);
  `GET .../evidence/verify` writes `verifiedAt` on every call (`evidence.service.ts:320`).
- Fine at hundreds of rows, poor at tens of thousands, which is the F4 case.

### 2.6 Direct answer: what writes on every frame rather than every event

Postgres:

- **Per timer, regardless of activity:** `integrity_snapshots` every 10 s, `code_snapshots` every
  30 s.
- **Per keystroke:** `editor_deltas`; and after a paste, `observations` plus the whole flag merge
  path (F4).
- **Per ASR hypothesis (design-implied):** `transcript_segments` about every 300 ms (F6).
- **Not per frame:** no video-frame or pointer-move row exists. `mousemove` only resets an idle
  timestamp on the client, and `raf_gap` events are dropped by the server.

Redis, outside this audit's scope but the same pattern: every dashboard frame does three
sequential commands (`INCR`, `LPUSH`, `LTRIM`, `emitter.ts:21-30`), and `timer.tick` runs every
second and `integrity.tick` every two, so about 1.5 frames per second per live session before any
event. That belongs to the cost audit.

---

## 3. Improvements, ordered by impact

### 3.1 No migration (code or configuration only)

1. **Fix F1.** On a Redis miss, or on a unique-violation from the insert, read the head from
   Postgres (`SELECT seq, hash FROM observations WHERE "sessionId" = $1 ORDER BY seq DESC LIMIT 1`,
   served by the existing unique index), retry the insert once, and write Redis after. Surface a
   dropped batch to the dashboard as a degraded state instead of only logging it. Delete the
   per-session Redis keys at seal and give them a TTL as a fallback.
2. **Bound inputs (F11).** Add maximum lengths to the telemetry, delta and internal ingest schemas,
   cap `payload` size, truncate sandbox `stdout` and `stderr` before storing, and add a per-socket
   rate limit.
3. **Fix the pool (F10).** Set `max` explicitly in the `PrismaPg` config, put PgBouncer in
   transaction mode in front, and bound each session's write queue so overload becomes visible
   backpressure instead of memory growth.
4. **Edge-trigger `typed_ratio_low` (F4).** Emit on the transition into the low-ratio state, or at
   most once per interval. This changes scoring, so it needs your call.
5. **Stop storing ASR partials (F6).** Keep the latest partial per speaker in Redis for the
   dashboard and persist finals only.
6. **Dedupe snapshots (F5).** Skip a `code_snapshots` insert when the content hash matches the
   previous one for that task, or only snapshot when deltas arrived since the last one.
7. **Purge refresh tokens (F7).** Nightly delete of rows expired more than 7 days ago, in the
   existing retention worker.
8. **Extend retention (F8).** Cover `editor_deltas`, `code_snapshots`, `code_executions`,
   `integrity_snapshots` and the other unpurged tables, and reconcile the windows with the consent
   text, or make the consent text read the same configuration. Decide whether `Consent.retentionDays`
   is real or dropped.
9. **Revoke privileges (F9).** Create a separate application role without `UPDATE` or `DELETE` on
   `observations`, `consents`, `flag_adjudications` and `audit_logs`, and run retention under a
   different role. This is a SQL grant, not a Prisma model change.
10. **Keyset pagination in the evidence export (F15).**

### 3.2 Requires a migration

Ordered by impact. Items 1 to 3 are cheapest while the tables are empty.

1. **Index `flag_observations("observationId")`** (F2). One line in `schema.prisma`
   (`@@index([observationId])`). On a populated table use `CREATE INDEX CONCURRENTLY`, which
   Prisma will not generate, so hand-edit the SQL.
2. **Index or remove `sessionId` on `editor_deltas`, `code_snapshots`, `code_executions`** (F3).
   Dropping the redundant column is the better long-term choice (F13) and needs code changes in
   the export query, the runtime insert and `coding.service.ts`.
3. **Index `refresh_tokens("expiresAt")`** once the purge exists (F7).
4. **Plan time partitioning for the four big append-only tables** (`observations`,
   `editor_deltas`, `integrity_snapshots`, `transcript_segments`) before launch. Retention becomes
   `DROP PARTITION` instead of hundreds of millions of row deletes. Primary and unique keys must
   include the partition key, so `(sessionId, seq)` uniqueness changes shape, and Prisma cannot
   model partitions, so this is a hand-written SQL migration. By my estimates `editor_deltas`
   passes 500M rows inside the first month at 10k sessions per day and `integrity_snapshots` in
   about 5 months. Retrofitting onto a populated table means a table swap and backfill.
5. **Version the chain hash and include `llr` and `clientTs`** (F9). Needs a format version so
   sealed sessions keep verifying under the old formula.
6. **Slim the observation row** (F13): drop `prevHash`, store `hash` as `bytea`. About 20 percent
   of the all-in row. Touches evidence tables, so pre-launch or never.
7. **Drop `CodeEvaluation.editTimeline` and `pasteMap`** and compute on read (F13).
8. **Diff-based or compressed snapshots** if snapshot volume still matters after deduping (F5, F12).
9. **Change `audit_logs` FKs from `SET NULL` to `RESTRICT`** so audit rows stay attached to their
   session, once a session delete path is defined.
10. **Define an erasure and anonymization path for users and candidates** (F14). Large; needs a
    policy first.

### 3.3 What I would not do

- Change `sessionId` or the `cuid` keys to `bigint` or `uuid`. It saves about 20 bytes per index
  entry and rewrites every child table. Partitioning and dropping duplicates recover more.
- Move to a time-series store or split observations by channel. The problem is row count and
  retention mechanics, not the model.
- Add read replicas before F2, F3 and F10 are fixed. They do not address a write-side ceiling.

---

## 4. What I did not check

- **Nothing was executed.** No queries, no `EXPLAIN`, no row counts, no measured table sizes, no
  load test. Every figure in section 2 is arithmetic on stated assumptions and can be off by a
  large factor in either direction.
- **No production configuration exists in the repo.** Postgres `max_connections`, Redis
  persistence and eviction policy, and any managed-service settings are unknown. The Redis and pool
  findings rest on the dev `docker-compose.yml` and library defaults.
- **Read by grep for writes only, not end to end:** `lifecycle.service.ts`, `link.service.ts`,
  `suggestion.service.ts`, `jd.service.ts`, `org.service.ts`, `question-bank.service.ts`,
  `coding-task.service.ts`, `workers/jd-parse.worker.ts`, `workers/link-expiry.worker.ts`,
  `pipeline/steps/{composite-score,answer-grading,seal-verify,media-index}.step.ts`. Their writes
  are single-row upserts and updates by grep; I did not read them for hidden loops.
- **Frontend:** only `lib/candidate/telemetry.ts`, `candidate-editor.tsx`, `candidate-room.tsx`
  and `candidate-panel.tsx`. The refresh-token cadence in F7 is inferred from the 15 minute TTL,
  not from the client refresh code.
- `fusion.engine.ts` and `ml/` were not read beyond confirming `ml/` has no database access.
- Socket.IO's configured or default per-message size limit was not verified (F11).
- I did not check whether the `interview_sessions.candidateId` gap matters in practice; I did not
  trace which candidate-history queries filter on it.

## 5. Noticed outside this audit's scope (not investigated)

- **Pointer leave can never fire from the current client.** `pointer.detector.ts:7-9` needs a
  `leave` event carrying `durationMs`, but the client sends `leave` without a duration
  (`telemetry.ts:85-88`) and puts the duration on the later `enter` event (`:191-196`), which the
  detector ignores.
- **An editor paste is counted twice.** `paste.detector.ts:6-8` emits `paste_large` for any
  clipboard paste of 40 or more characters, including `target: "editor"`, and
  `authorship.detector.ts:36-45` emits `paste_large` again for the same paste from the editor
  delta. Same channel, each with its own LLR.
- **Fusion lease.** `SessionRuntime.start()` ignores the result of the `SET ... NX`
  (`session-runtime.ts:109`) and renewal sets the key without `NX` (`:125`). For the failure-modes
  audit.
- **Per-frame Redis cost and per-session Redis keys that never expire.** For the cost audit.

I have not acted on any of this and have opened no follow-up.
