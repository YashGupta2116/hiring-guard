# VeriTrust failure-mode audit: traffic spike + dependency failure (Redis, Postgres)

Read-only audit of `/Users/yashgupta/Desktop/veritrust`. Every structural claim below is cited to a
file and line, freshly read for this audit (not copied from `docs/audits/cost.md`, though that prior
audit's finding about unreclaimed Redis keys and the fusion lease is reused as a starting point and
re-verified here). Where I inferred rather than read something, or didn't check it, that's said
explicitly. Simulation means reasoning through the code paths, not running the system — I did not
actually start the stack, kill Redis/Postgres, or load-test it.

## Fix first (read this before anything else below)

**A single Redis command failure anywhere in three of `SessionRuntime`'s five timers kills the entire
API process, not just the affected session.** This is not a slow degradation — it is `process.exit(1)`
on the next unguarded Redis error, taking down every other LIVE session on that process with it.
Details and citations in "Claim 1" below. Given the "single process per session, no horizontal scaling
without session affinity" constraint already documented in `docs/audits/cost.md`, one process commonly
*is* a meaningful fraction of concurrent capacity, so this is a real availability risk, not a
theoretical one. This is flagged only — I made no code changes.

## Simulation: sudden traffic spike

What I checked: `backend/src/app.ts`, `backend/src/middlewares/rate-limit.ts`,
`backend/src/utils/prisma.ts`, `backend/src/config/env.ts`, `docker-compose.yml`.

- **The rate limiter does not protect against a genuine multi-user spike.** `apiLimiter` is 300
  requests/60s (`backend/src/middlewares/rate-limit.ts:40`) using `express-rate-limit`'s default
  `keyGenerator`, which buckets by client IP — I did not find a custom `keyGenerator` passed to
  `apiLimiter` (only the `code-run` limiter overrides it, per-`sessionId:taskId`,
  `backend/src/routes/candidate.routes.ts:19`). A spike from many distinct users each staying under
  300 req/min is not throttled at all by this middleware; it only throttles a single abusive/broken
  client.
- **No Postgres connection pool size is configured anywhere in this repo.** `backend/src/utils/prisma.ts:5`
  constructs `new PrismaPg({ connectionString: env.DATABASE_URL })` with no `max`/pool option, and
  `backend/src/config/env.ts:34` just validates `DATABASE_URL` as a non-empty string — no
  `connection_limit`/`pool_timeout` query params documented or defaulted anywhere I could find (checked
  `.env.example` too — plain `postgresql://postgres:postgres@localhost:5432/veritrust`). This means the
  effective pool size is whatever `node-postgres`'s own default is; I did not read into the
  `pg`/`@prisma/adapter-pg` source to confirm that default number, so I'm not stating it as a specific
  figure — flagging that it's unconfigured, not what it defaults to.
- **What fails first under a spike, in the order I'd expect from the code as written:** (1) Postgres
  connection pool exhaustion — every write in the hot session path goes through Prisma with no pool
  tuning (`appendObservations` at `backend/src/services/evidence.service.ts:82`,
  `IntegritySnapshot.create` every 10s per session at `backend/src/live/session-runtime.ts:191`,
  `EditorDelta.createMany` at `session-runtime.ts:326`), so requests start queuing for a connection once
  concurrent LIVE sessions × their per-session Postgres write rate exceeds pool capacity; (2) the single
  Node process handling all sockets for its share of LIVE sessions (per `cost.md`'s finding that there is
  no `@socket.io/redis-adapter` and `registry` is an in-process `Map`,
  `backend/src/live/registry.ts:4`) becomes CPU/event-loop bound, since every session's 1s/2s/2s timer
  ticks (`session-runtime.ts:108-118`) and every telemetry batch is processed inline on that one process;
  (3) Redis itself is the least likely first failure under pure traffic growth — the per-session load is
  small ops (`INCR`/`LPUSH`/`LTRIM`, ints and short JSON, per `cost.md`'s arithmetic) and Redis is
  generally cheap to scale for throughput at this shape. I did not load-test this, so this ordering is
  inference from the code's structure, not measurement.
- **What slows first:** interviewer dashboard responsiveness (timer/integrity ticks queueing behind an
  overloaded event loop or a Postgres write backlog) and candidate telemetry ingest latency (same
  serialized write queue, `session-runtime.ts:99, 238-242` — one slow write blocks every subsequent
  write for that session, including fusion/flag processing, since `enqueue()` chains everything through
  `this.writeQueue`).
- **What becomes inconsistent:** nothing new beyond what's described under Redis/Postgres failure below
  — a spike's failure mode is really "the dependency failure modes below, arrived at gradually instead
  of suddenly."

## Simulation: Redis failure

What I checked: `backend/src/utils/redis.ts`, `backend/src/live/session-runtime.ts` (full file),
`backend/src/sockets/emitter.ts`, `backend/src/live/ingest.ts`, `backend/src/middlewares/rate-limit.ts`,
`backend/src/services/auth.service.ts`, `backend/src/index.ts`, `backend/src/worker.ts`.

- `redis` client: `new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })`
  (`backend/src/utils/redis.ts:9-12`). With `maxRetriesPerRequest: 3`, a command issued while
  disconnected is retried through ioredis's reconnect attempts and then **rejects** once that budget is
  exhausted — this doesn't require a long outage, a Redis blip of roughly a few hundred milliseconds to
  a couple of seconds (default exponential-backoff `retryStrategy`) is enough to make an in-flight
  command reject. I did not read ioredis's internal default `retryStrategy` timing to give an exact
  number; stating the mechanism, not a precise threshold.
- **What fails immediately and safely:** HTTP-request-scoped Redis calls. Express 5 (confirmed in
  `backend/CLAUDE.md`: "Express 5 + TypeScript") forwards a rejected promise from an async route handler
  to the error middleware automatically, so e.g. `runtime.start()`'s initial lease `SET ... NX`
  (`session-runtime.ts:109`), `transition()`'s `publishSessionEvent` (`session-state.service.ts:79`), or
  a rate-limited request through `RedisStore` all surface as a normal HTTP error response, not a process
  crash — for the rate limiter specifically, `passOnStoreError: true`
  (`backend/src/middlewares/rate-limit.ts:21`) means it **fails open** (allows the request through)
  rather than blocking it. Auth/login is unaffected by Redis being down at all — `auth.service.ts` does
  not call `redis` (grepped the whole file, no match); JWT verification is stateless and refresh-token
  reuse detection appears DB-based (`REFRESH_TOKEN_REUSED` in `auth.service.ts:131`).
- **What fails catastrophically: three of `SessionRuntime`'s five `start()`-time timers are unguarded
  against Redis errors and, on rejection, crash the whole process.** This is the mechanism behind Claim
  1 below — see that section for the full trace.
- **What becomes inconsistent:** the evidence hash chain head, `s:{sid}:chain`
  (`evidence.service.ts:23-25`), is read-then-written non-atomically in `appendObservations`
  (`loadChainHead` at line 50, `HSET` at line 83, no `WATCH`/Lua/optimistic-lock between them). If Redis
  drops the key mid-session (eviction, restart without persistence, `FLUSHALL`) the next
  `appendObservations` call treats it as a fresh chain (`loadChainHead` falls back to `{ lastSeq: 0,
  lastHash: genesis(sessionId) }`, `evidence.service.ts:34-36`) and starts re-numbering `seq` from 1
  against a `sessionId+seq` uniqueness constraint I did not verify at the Postgres schema level (not
  checked — `prisma/schema.prisma` uniqueness constraints on `Observation` weren't read for this audit).
  At minimum this silently breaks the hash chain's continuity (a fresh genesis mid-session, not a
  detectable "gap") without raising any alarm at write time — `verifyChain` (referenced at
  `seal.service.ts:123`) would presumably catch it at seal time, but that's the first point anything
  would notice, potentially after a whole session's worth of scoring already happened on the broken
  chain. The per-connection sequence-dedup keys in `backend/src/live/ingest.ts:24-32` (`GET`/`SET`, no
  TTL) have the same "Redis loses the key mid-session" exposure: a dropped dedup key makes the next
  batch look like a fresh connection, which could replay or skip telemetry depending on client-side
  sequencing — I did not trace the client `TelemetryReporter` retry logic to confirm which.
- **The fusion lease's own inconsistency exposure is covered in full under Claim 2.**

## Simulation: Postgres failure

What I checked: `backend/src/utils/prisma.ts`, `backend/src/live/session-runtime.ts`,
`backend/src/services/seal.service.ts`, `backend/src/services/health.service.ts`,
`backend/src/pipeline/flow.ts`, `backend/src/worker.ts`.

- No Postgres-specific retry/circuit-breaker logic anywhere I found — Prisma calls are awaited directly
  throughout (e.g. `session-runtime.ts:191` `prisma.integritySnapshot.create`, `:326`
  `prisma.editorDelta.createMany`). A Postgres outage makes these reject.
- **Session-scoped writes are routed through `enqueue()`**, which *does* catch: `this.writeQueue =
  this.writeQueue.then(task).catch((err) => logger.error(...))` (`session-runtime.ts:239-241`). So a
  Postgres failure during telemetry ingest, editor-delta processing, or the 10s integrity snapshot is
  logged and dropped, not an unhandled rejection — the process survives, but silently loses that write
  (no retry, no backfill, no client-visible error). This is a real gap between "the process stays up"
  and "the data is complete" — see inconsistency below.
- **Seal sequence**: `sealSession` (`seal.service.ts:70-156`) is written to be resumable — each of its 9
  steps is idempotent and checkpointed in Redis (`markStepDone`, `seal.service.ts:24-27`), and a crash
  mid-seal is picked back up by `resumeStuckSeals()` on next boot (`seal.service.ts:159-168`, called from
  `backend/src/index.ts:23`). If Postgres itself is down during a seal attempt, the step that touches
  Postgres throws, the whole `sealSession` call rejects, is caught by its own `catch` block
  (`seal.service.ts:143-155`) which tries to write an audit log and transition the session to `ABORTED`
  — both of which **also need Postgres**, so during a real Postgres outage this catch block itself likely
  fails too, and the error simply propagates up to whatever called `endSession`/`sealSession` (an HTTP
  request handler, or `resumeStuckSeals`'s own `.catch` at `seal.service.ts:164-166`, which just logs).
  Net effect: sessions can get stuck in `SEALING` for the duration of a Postgres outage, which is
  arguably the correct conservative behavior (better than sealing on partial data), but there's no
  monitoring surfaced for "how many sessions are stuck in SEALING right now" (see monitoring gaps).
- **What becomes inconsistent:** any `enqueue()`-routed write during a Postgres outage — an
  `Observation`, `EditorDelta`, `CodeSnapshot`, or `IntegritySnapshot` — is silently dropped
  (`session-runtime.ts:239-241` logs and moves on). Because `appendObservations` also advances the Redis
  chain head (`evidence.service.ts:83`) only *after* the Postgres insert succeeds (line 82 before line
  83), a failed insert means the Redis chain head does NOT advance for that batch — so the two stores
  stay consistent with each other on failure. But the fusion accumulator (`this.fusionState`, in-memory
  only, `session-runtime.ts:97`) is updated by `applyFusionAndFlags` independently of whether the
  Postgres write that produced those rows succeeded — I traced the call order: `processTelemetryBatch`
  calls `appendObservations` (line 295, can throw/reject on DB failure) and only then
  `applyFusionAndFlags(created)` (line 296) using the rows Postgres actually returned, so a DB failure
  here throws before fusion state is touched, which is fine. Where it's less clean: the live integrity
  *displayed* to interviewers (`emitIntegrityTick`, decoupled from Postgres, reads only `this.fusionState`
  in memory) keeps updating in real time regardless of whether the `IntegritySnapshot` row every 10s
  (`persistIntegritySnapshot`, line 184-194) is actually landing in Postgres — so a sustained Postgres
  outage produces a live dashboard that looks normal while the audit trail (`IntegritySnapshot` rows,
  used at minimum by `seal.service.ts:116`'s final snapshot) has gaps, with no visible indicator to the
  interviewer that persistence is failing.

## Claim 1 — "timer tick calls Redis unguarded, unhandledRejection exits the process"

**Confirmed, and more specific than the claim states: it's 3 of the 5 timers, not all of them, and the
distinction is `enqueue()` vs. bare `void`.**

`SessionRuntime.start()` (`backend/src/live/session-runtime.ts:108-118`) starts five intervals:

| Timer | Line | Wrapped in `enqueue()`? | Touches Redis directly or via a Redis-calling function? |
|---|---|---|---|
| `leaseInterval` → `renewLease()` | `:110` | No — `void this.renewLease()` | Yes — `redis.set(...)` at `:125`, no try/catch |
| `timerInterval` → `tick()` | `:111` | No — `void this.tick()` | Yes — `tick()` calls `emitToInterviewers` (`:142`), which does `redis.incr`/`redis.lpush`/`redis.ltrim` with no try/catch (`backend/src/sockets/emitter.ts:22,25,26`) |
| `producerHealthInterval` → `checkProducerHealth()` | `:112` | Yes — `this.enqueue(() => ...)` | Only touches Redis when a producer is degraded (`emitToInterviewers` inside, same as above), but the rejection is caught by `enqueue()`'s `.catch()` (`:239-241`) |
| `integrityTickInterval` → `emitIntegrityTick()` | `:113` | No — `void this.emitIntegrityTick()` | Yes — calls `emitToInterviewers` (`:177`), same unguarded Redis calls |
| `integritySnapshotInterval` → `persistIntegritySnapshot()` | `:114` | Yes — `this.enqueue(() => ...)` | Postgres only, and caught by `enqueue()` regardless |

So `renewLease`, `tick`, and `emitIntegrityTick` are invoked as `void <asyncCall>()` directly inside
`setInterval`, with **no `.catch()` and no surrounding try/catch anywhere in the call chain down to the
raw `redis.incr`/`lpush`/`ltrim`/`set` calls**. When one of those rejects (Redis blip, per the retry
budget discussed above), the resulting promise rejection has no handler attached anywhere — this is a
genuine unhandled promise rejection at the Node process level, not just an uncaught application error.

Process-level handling, confirmed at `backend/src/index.ts:48-56`:
```
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});
```
`shutdown(..., 1)` closes the HTTP server, disconnects Prisma/Redis, and calls `process.exit(1)`
(`index.ts:27-43`). So yes: **the claim is correct as read** — a single Redis error inside `tick()`,
`renewLease()`, or `emitIntegrityTick()`, on any one of the potentially many LIVE sessions a process is
running, exits that entire API process, taking down every other session it was serving (candidate
sockets, interviewer sockets, all in-flight HTTP requests). `backend/src/worker.ts:71-78` has the
identical `unhandledRejection` → `shutdown(..., 1)` → `process.exit` pattern for the worker process, for
whatever it's worth there (BullMQ's `Worker` generally catches processor errors internally and emits
`'failed'` rather than throwing unhandled — I did not verify this claim against BullMQ's source, so I'm
not asserting the worker is equally exposed, just noting the same exit-on-unhandledRejection pattern
exists there too).

One nuance worth stating precisely: this is not "any Redis blip always kills the process" — it requires
the blip to land during one of the ~1 Hz windows where `tick`/`renewLease`/`emitIntegrityTick` actually
issue a command and that command exhausts its 3-retry budget. But with three such timers firing every 1
or 2 seconds for the full session duration, across however many concurrent LIVE sessions one process is
running, the exposure window is close to "always" during any real Redis instability lasting more than a
couple hundred milliseconds.

## Claim 2 — "fusion lease loss / two runtimes scoring the same session at once"

**Confirmed: the lease has no enforcement mechanism at all. It is written and deleted, but never
checked.** This is stronger than "loss isn't detected" — acquisition failure isn't detected either.

- TTL: `FUSION_LEASE_TTL_MS = 5000` (`backend/src/config/constants.ts:32`). Renewal interval:
  `FUSION_LEASE_RENEW_MS = 2000` (`constants.ts:33`) — a 2.5x safety margin against a single missed
  renewal, which is reasonable *if* the lease were actually gating anything.
- **Acquire**: `await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS, "NX")` at
  `session-runtime.ts:109`. The return value (`"OK"` on success, `null` if the key already existed) is
  **discarded** — there is no `if (result !== "OK") { ... }` anywhere in `start()`. Whether or not this
  process actually won the lease, `start()` proceeds unconditionally to start every timer, including the
  ones that do the actual scoring writes (`tick`, fusion via telemetry processing, `emitIntegrityTick`,
  `persistIntegritySnapshot`).
- **Renew**: `await redis.set(this.leaseKey(), "1", "PX", FUSION_LEASE_TTL_MS)` at
  `session-runtime.ts:125` — plain `SET`, no `NX`, no `XX`, no comparison against a value unique to this
  process/instance. The stored value is always the literal string `"1"` — there is no per-owner token
  (no UUID, no process id, no instance identity) anywhere in the lease key/value. This means the lease
  cannot distinguish "I still hold this" from "someone else grabbed it after mine expired" — a renewal
  call always succeeds and always overwrites, regardless of who last held the key.
- **No read-back / ownership check anywhere.** I grepped the whole backend for the lease key pattern and
  every reference is one of: write (`:109`), write (`:125`), or delete (`:441`, on `destroy()`). Nothing
  ever calls `redis.get`/`GET` on `s:{sid}:lease` to confirm this process still owns it before doing
  scoring work. The lease is, functionally, dead code with respect to actually gating anything — it sets
  a key that nothing reads.
- **Release**: `await redis.del(this.leaseKey())` on `destroy()` (`session-runtime.ts:441`), called from
  `seal.service.ts:96` during the normal seal sequence. Clean on the happy path.
- **What happens if the lease is "lost" (TTL expires without renewal — e.g. the process holding it is
  network-partitioned from Redis but still alive and still running its local event loop/timers):**
  nothing detects it and nothing changes behavior. The original process keeps calling `tick()`,
  processing telemetry, and writing `Observation` rows through `appendObservations` exactly as before —
  it never checks whether its lease is still valid, so from its own perspective nothing happened. If a
  second process were, for whatever reason, also running a `SessionRuntime` for the same session (see
  below for how that could happen), it would likewise never check the lease and would run its own
  scoring independently.
- **Can two runtimes actually end up scoring the same session concurrently? Yes, via a documented race
  in `startSession` itself, not just a hypothetical.** `backend/src/services/lifecycle.service.ts:39-56`:
  the `SessionRuntime` is constructed, registered (`registry.set`, line 49), and **started** (`await
  runtime.start()`, line 50) — all of this **before** the atomic Postgres state transition
  (`transition(sessionId, ["ADMITTED"], "LIVE", ...)`, line 56, which is the only place with a real
  compare-and-set guard, per `session-state.service.ts:53-62`'s `updateMany` gated on current status).
  The only pre-transition guard is a plain read at `lifecycle.service.ts:19-25`
  (`prisma.interviewSession.findFirst` then `if (session.status !== "ADMITTED") throw ...`), which is
  not atomic with the later transition. If `startSession` is invoked twice concurrently for the same
  session (double-submit, retried request after a client-side timeout, or two API replicas both handling
  it — recall `cost.md`'s finding that this app has no built-in single-process guarantee across
  replicas), both calls can pass the early read check, both construct and `start()` a `SessionRuntime`
  (each doing its own no-op-checked `SET NX` on the same lease key), both call `registry.set` (last
  writer wins, `registry.ts:10-11`, no compare-and-set), and only then does the real Postgres transition
  serialize them — one succeeds, one throws `INVALID_STATE_TRANSITION` from line 56. **The losing call's
  `SessionRuntime` is never torn down.** `startSession` has no try/catch around the transition call to
  call `runtime.destroy()` or `registry.delete()` on failure — the error just propagates out of
  `startSession`. That loser's five timers (`leaseInterval`, `timerInterval`,
  `producerHealthInterval`, `integrityTickInterval`, `integritySnapshotInterval`) keep running
  indefinitely (nothing ever calls `clearInterval` on them outside `destroy()`, and `destroy()` is only
  invoked from the seal sequence, `seal.service.ts:96`, which the loser's session never reaches through
  this path). Depending on which `registry.set` call happened last, `registry.get(sessionId)` used by
  the socket handlers (`backend/src/sockets/index.ts:127,147,154,160,172`) may route live telemetry to
  either the winner or the loser, but **both** runtimes' zombie timers keep firing `tick`/`emitIntegrityTick`
  (duplicate `emitToInterviewers` writes, corrupting frame ordering in the 2000-entry replay buffer via
  double `INCR`/`LPUSH` — see `cost.md`'s finding on that buffer never being cleaned up either) and
  `persistIntegritySnapshot` (duplicate `IntegritySnapshot` rows for the same session) for as long as the
  process lives. If the loser also happens to be the one wired to `registry` for telemetry, its
  `appendObservations` calls race the winner's against the same non-atomic `loadChainHead`/`HSET` pair
  (`evidence.service.ts:50,83`) with no lock between them — this is exactly the scenario the comment at
  `evidence.service.ts:44-45` ("this function does not itself lock, matching the 'single writer holding
  the lease' design") assumes cannot happen, and the lease code as written does not actually prevent it.
- **Bottom line on the claim: no SET NX-as-fencing, no version/fencing token, no ownership check ever
  performed. The lease cannot and does not prevent two processes from believing they hold it and both
  scoring the same session — and there is a concrete, non-exotic path (`startSession` called twice) by
  which two `SessionRuntime` instances for the same session can coexist in one process's memory today.**
  I did not test this race empirically (no live run), this is a static trace of the code.

## Monitoring that should exist but does not

I grepped the whole `backend/` tree for `prom-client`, `statsd`, `datadog`, `sentry`, `opentelemetry`,
and `@sentry` — none are present in `backend/package.json` or anywhere in `backend/src`. The only
observability primitives in this codebase are `pino`/`pino-http` structured logging
(`backend/src/app.ts:23-34`) and the two health endpoints:

- `GET /health` (`backend/src/controllers/health.controller.ts:6-8`) — liveness only, always returns ok
  if the process is up.
- `GET /ready` (`health.controller.ts:10-19`, backed by `backend/src/services/health.service.ts:29-35`)
  — pings Postgres (`SELECT 1`) and Redis (`PING`) with a 2s timeout each, returns 200/503. This is a
  reasonable readiness probe for an orchestrator but is not alerting or a metric — nothing scrapes or
  graphs its history, and it doesn't distinguish "brand new process not warmed up" from "dependency died
  mid-session."

Concretely absent, all inferred from what the code does and does not surface, not read from any existing
dashboard/alert config (none exists in this repo):

1. **No counter/alert on `unhandledRejection`/`uncaughtException` beyond a single `logger.fatal` line**
   (`index.ts:48-56`, `worker.ts:71-78`) — the log line exists, but there's nothing to page anyone or
   distinguish "this happened once, benign" from "this is happening every few seconds, Redis is down."
   Given Claim 1's finding, this is the single highest-value alert missing from the system.
2. **No metric on active `SessionRuntime` count vs. `registry` map size vs. sessions actually `LIVE` in
   Postgres.** The zombie-runtime race in Claim 2 would be invisible today — nothing compares "how many
   `SessionRuntime`s exist in memory" against "how many sessions does Postgres think are LIVE."
3. **No metric on Redis command failure rate or ioredis reconnect events.** `redis.on("error", ...)`
   (`utils/redis.ts:15-17`) only logs; nothing counts these or exposes a rate.
4. **No metric on the `enqueue()` write-queue drop path.** `session-runtime.ts:239-241` silently
   swallows failed writes into a log line — there's no counter for "how many observations/snapshots were
   dropped this session," which is exactly the signal an operator would need to know a session's audit
   trail has gaps (relevant to the Postgres-outage inconsistency described above).
5. **No metric on sessions stuck in `SEALING`.** `resumeStuckSeals()` (`seal.service.ts:159-168`) finds
   these at boot, but nothing watches for a session sitting in `SEALING` for an abnormally long time
   while the process stays up (e.g. Postgres degraded but not fully down, so seal steps keep timing out
   and retrying rather than crashing).
6. **No metric on the Postgres pool** (size, in-use, wait time) — unsurprising since the pool itself is
   unconfigured (see traffic-spike section), but it means pool exhaustion under load would show up only
   as generically slow/failing requests in logs, not as a distinguishable signal.
7. **No structured metric on Redis memory usage / key count**, which `cost.md` already flagged as
   unboundedly growing (`s:{sid}:buf`, `:frameseq`, `:chain`, `:state`, per-connection seq keys never
   TTL'd or deleted except the lease and `sealProgress`) — without this, the Redis memory-pressure risk
   `cost.md` describes would be discovered by an eviction incident, not a dashboard trend line.

## Recommended safeguards, cheapest first

1. **Wrap `renewLease()`, `tick()`, and `emitIntegrityTick()` in a try/catch (or route them through the
   existing `enqueue()` helper, which already has one) so a Redis error is logged and skipped instead of
   becoming an unhandled rejection.** This is a small, local, low-risk change — `enqueue()` already
   exists and already does exactly this for the other three timers (`session-runtime.ts:238-242`). This
   is the single highest-value fix relative to effort given Claim 1's blast radius.
2. **Check the return value of the lease `SET ... NX` in `start()`** (`session-runtime.ts:109`) and
   `redis.get`-verify ownership before doing scoring work in `renewLease()`, or at minimum log loudly
   when acquisition fails instead of silently proceeding. Cheap: a few lines, no schema/infra change.
3. **Give the lease value a per-instance identity** (e.g. `crypto.randomUUID()` generated once per
   `SessionRuntime` instance) and renew/release with a compare-and-delete Lua script (the standard
   Redlock-style pattern: `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del",
   KEYS[1]) end`) instead of the current unconditional `SET`/`DEL`. Still cheap — no new infra, just
   changes the value written and the renewal script.
4. **Have `startSession` clean up on a lost transition race**: wrap the `transition(...)` call at
   `lifecycle.service.ts:56` so that on failure it calls `runtime.destroy()` and `registry.delete(sessionId)`
   before rethrowing, so a double-start no longer leaves a zombie `SessionRuntime` with live timers.
   Alternatively (and more robustly), move the Postgres `transition()` call to *before* `runtime.start()`,
   so the atomic guard runs first and a losing caller never constructs/starts a runtime at all — this is
   a reordering of existing calls, not new mechanism.
5. **Add the alert/metric surface described above** — at minimum, a counter on `unhandledRejection` /
   `uncaughtException` occurrences wired to paging, and a periodic reconciliation job comparing in-memory
   `registry` contents against Postgres `status = 'LIVE'` sessions. This needs an actual metrics
   pipeline (prom-client + scrape target, or a SaaS APM), which is a real dependency addition, not a
   code-only change — hence ordered after the pure code fixes above.
6. **Configure the Postgres connection pool explicitly** (`connection_limit`/`pool_timeout` on
   `DATABASE_URL`, or the equivalent `PrismaPg` option) sized to expected concurrent LIVE sessions, and
   consider a global concurrency cap on LIVE sessions per process — `cost.md` already noted nothing in
   the app caps concurrent LIVE sessions. This requires actual capacity planning (know your pool size vs.
   expected concurrency), not just a flag flip.
7. **Architectural**: move the fusion lease from "decorative Redis key" to something that actually gates
   execution — e.g. a real distributed lock library (Redlock) wrapping the entire `SessionRuntime`
   lifecycle, or eliminate the need for a lease altogether by making the "who owns this session" decision
   at the load-balancer/session-affinity layer (which `cost.md` already flags as a needed piece for
   horizontal scaling) so only one process ever attempts to construct a `SessionRuntime` for a given
   session in the first place. This is the most expensive item here — it touches deployment topology, not
   just this file.

## Not checked

- Did not run the stack, did not actually kill Redis or Postgres, did not load-test. Everything above is
  a static trace of the code plus the documented behavior of ioredis's `maxRetriesPerRequest` and
  Express 5's async-handler error forwarding — neither of which I verified against those libraries'
  source in this repo (both are node_modules dependencies, not read for this audit).
- Did not check `prisma/schema.prisma` for uniqueness constraints on `Observation(sessionId, seq)`, which
  would materially change the severity of the "chain head reset mid-session" inconsistency described
  under Redis failure (a unique constraint would turn silent corruption into a loud insert failure
  instead — better, but still not handled by any code I found).
- Did not verify BullMQ's internal error handling (whether job-processor exceptions can ever surface as
  unhandled rejections) against BullMQ's source — noted as an open question under Claim 1.
- Did not check the frontend (`frontend/`) for how it behaves when `/ready` or normal API calls start
  failing during a dependency outage (retry/backoff behavior, user-facing error states).
- Did not check `ml/` — confirmed out of scope per the task framing, not a runtime service.
- Did not check any infra/deployment config outside this repo (health-check wiring, autoscaling triggers,
  actual alerting/paging setup) — if any of the monitoring gaps above are actually covered by
  out-of-repo tooling, I have no visibility into that.
