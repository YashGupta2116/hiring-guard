# Vendor lock-in and migration audit: VeriTrust

Audit 3 of 6. Read-only. No file other than this report and `security.md` was created or changed.
Repo state audited: `main` at `f4f7462`. I started at `f3b7b4d`; five commits from other authors
landed while I worked (browser-side camera analysis, WebRTC signalling, client lockdown, a `local`
sandbox provider, a rename to HiringGuard, audits 4 to 6). I reviewed that delta and updated this
report. Items that exist only because of it are marked **New since f3b7b4d**.

Paths are relative to the repo root. `file:line` cites are to the code as it is on disk at
`f4f7462`. Nothing was executed: coupling was measured by reading and by counting imports and call
sites with grep, and the scale figures are arithmetic on the assumptions in section 1, not
measurements.

## Read this first

**Verdict.** Vendor lock-in in the usual sense is shallow: there are no cloud SDKs, no proprietary
database features, and most external services sit behind small interfaces. The lock-in that
matters is architectural, and it is deeper than the stack list suggests:

1. **The live path is pinned to one Node process.** Session runtimes live in an in-process map,
   socket emission goes to the local `io`, and the Redis lease that is supposed to enforce one
   writer is not enforced. You cannot scale the live path out by configuration.
2. **Redis is not a cache here, it is the state store.** Every use is state or coordination, some
   of it correctness-critical (evidence chain head, seal progress, the session start gate, and since
   `f3b7b4d` the `roomOpen` and `telemetrySeen` flags, where a lost `telemetrySeen` makes a real
   interview be discarded). Swapping the technology is a rewrite of the live path's state layer,
   not a config change.
3. **Prisma is imported in 47 files with no repository layer, and its generated enums are the
   domain vocabulary in 47 files**, including the scoring engine and the request validators.
4. **Evidence verifiability is tied to one key held by the server.** Rotating or moving the key
   makes every existing sealed session unverifiable.

**Swap difficulty at a glance** (rows are what you would replace; columns are how):

| Dependency | Same family or managed variant | Different technology |
|---|---|---|
| Prisma | not applicable | Module rewrite: 47 files, about 250 calls. The sensitive part is about 15 call sites in the live path |
| Redis semantics | Config change (Valkey, ElastiCache, MemoryDB), with caveats | Rewrite of the live path's state layer, plus a module rewrite of the queue (6 files) |
| socket.io | Config change plus a new dependency (Redis adapter) | Module rewrite: 2 server files, about 9 client files; re-specifies the protocol |
| Postgres | Config change (RDS, Aurora, Cloud SQL, AlloyDB, Neon) | CockroachDB: mostly config plus transaction-retry work. MySQL and others: rewrite of the live path |
| Local storage to object storage | Module addition, interface exists | none needed |
| Docker sandbox to hosted runner | Module addition, interface exists | none needed |
| Signer to KMS | Small module rewrite (interface is synchronous) | plus a keyring so old sessions still verify |
| BullMQ to another queue | not applicable | Module rewrite: 6 files; the pipeline steps themselves are portable |

**What I would do first, cheaply:** section 5. None of it is a rewrite.

---

## 1. The 100k-user scenario

Assumptions, stated so you can change them:

- 100,000 daily active users, read as up to 100,000 sessions per day (10x the schema audit's
  scenario). If a session's candidate and interviewer both count, halve it.
- 60 minute sessions in a 10 hour working window: about 10,000 concurrent sessions on average and
  about 25,000 at a 2.5x peak. That is roughly 50,000 concurrent sockets at peak (one candidate and
  one interviewer each).
- Data and write rates are the schema audit's figures scaled by 10. They are estimates from code
  paths, not measurements.

Derived at that scale:

| Quantity | Estimate | Basis |
|---|---|---|
| Postgres write statements per second, peak, excluding transcripts | about 15,000 | 1,500 at 10k sessions per day, times 10 (schema audit section 2.4) |
| Unpurged table growth | over 100 GB per day, over 3 TB per month | editor deltas, integrity snapshots, code snapshots (schema audit section 2.2, times 10) |
| Redis commands per second from live ticks alone, peak | about 125,000 to 175,000 | 5 to 7 commands per live session per second: three per dashboard frame at 1.5 frames per second (`backend/src/sockets/emitter.ts:21-30`), a lease renewal every 2 s (`backend/src/live/session-runtime.ts:125`), and telemetry sequence bookkeeping (`backend/src/live/ingest.ts:24-32`) |
| API processes needed | on the order of 10 to 20 | inference: I assumed 1,500 to 3,000 live sessions per Node process; not measured |
| Pipeline worker throughput | about 3,600 sessions per day per worker process | assumes 3 s per step and 8 sequential steps; `Worker` is created with default concurrency 1 (`backend/src/worker.ts:24-34`); not measured |

The pattern to notice: at this scale nothing runs as one instance, and the code was built for one.

---

## 2. Coupling assessment

### 2.1 Prisma

**How tightly coupled.**

- 47 source files import the client singleton: 25 services, 9 pipeline files, 4 live files,
  3 middlewares, 2 workers, `worker.ts`, `index.ts`, one socket file and one controller. There is
  no repository or data-access layer. About 250 model calls, 28 relation `include` loads, and
  11 `$transaction` uses, several of them interactive
  (`backend/src/live/fusion/flag-builder.ts:85,102`,
  `backend/src/services/session-state.service.ts:47`, `backend/src/services/auth.service.ts:59`).
- Prisma-only features in use: `createManyAndReturn`, which the evidence writer depends on to get
  row ids back (`backend/src/services/evidence.service.ts:82`); `Prisma.JsonNull` and
  `InputJsonValue`; and Prisma error codes `P2002` and `P2025` mapped in the global error handler
  (`backend/src/middlewares/error-handler.ts:44-53`).
- The domain vocabulary comes from generated code: 47 files import `generated/prisma` (18 services,
  9 validators, 7 live, 5 pipeline, 3 utils, 2 middlewares, and others). The validators use the
  enums at runtime (`backend/src/validators/internal.schema.ts:4-5`), and the scoring engine and
  detection tables import `MonitoringChannel`, `Sensitivity` and `FlagSeverity` from it
  (`backend/src/live/fusion/fusion.engine.ts:13`, `backend/src/config/detection.ts:6`).
- The generated client is not committed (`backend/.gitignore` ignores `src/generated/`; no tracked
  files), so every build needs `prisma generate` (`backend/package.json` `build`).
- Policy: `Architecture.md:19` and `backend/CLAUDE.md` pin Prisma 7 and forbid Prisma 8. That is a
  self-imposed ceiling on upgrades.

**Swap: module rewrite.** Moving to Drizzle, Kysely, TypeORM or plain `pg` on the same database
means touching about 47 files and re-declaring the enums in a shared domain module. Most queries
are simple CRUD. The part that needs care is the live path's persistence: the observation insert
with returned ids, the flag merge transactions, snapshots, warnings and unscored windows, about
15 call sites in `backend/src/live` and `backend/src/services/evidence.service.ts`.

**What breaks at 100k.** Prisma cannot model partitioned tables or `CREATE INDEX CONCURRENTLY`. The
partitioning the schema audit recommends has to live in hand-written SQL migrations, which pushes
the schema away from `schema.prisma` and toward "Postgres plus Prisma-blind SQL". The default
10-connection pool per process (`backend/src/utils/prisma.ts:5`) also needs PgBouncer or explicit
sizing.

### 2.2 Redis semantics

Redis is used as a state store and coordination service. The architecture doc calls it a
"Cache / live state" (`backend/docs/Architecture.md:20`), but nothing in the code treats it as
disposable. 14 files import it, and the commands in use are `SET NX PX`, `GET`, `HGET`, `HSET`,
`HMGET`, `HINCRBY`, `INCR`, `LPUSH`, `LTRIM`, `LRANGE`, `EXPIRE`, `DEL`, `PUBLISH`, `PSUBSCRIBE` and
raw `call` for the rate limiter, plus BullMQ.

| Use | Where | Correctness-critical | Could be |
|---|---|---|---|
| Fusion lease (`SET NX PX`, renew, `DEL`) | `session-runtime.ts:109,125,441` | intended yes; result unchecked, see below | any store with atomic compare-and-set and TTL (etcd, DynamoDB conditional writes, a Postgres advisory lock) |
| Evidence chain head (`HMGET`, `HSET`) | `evidence.service.ts:32,83` | yes | Postgres; it is derivable from the observations |
| Frame sequence and replay buffer (`INCR`, `LPUSH`, `LTRIM`, `LRANGE`) | `emitter.ts:22-25,45` | dashboard resume | any ordered log |
| Warden cooldowns (`HMGET`, `HSET`, `HINCRBY`) | `backend/src/live/warden.ts:44-60` | no | in-memory in the runtime |
| Seal progress (`HGET`, `HSET`, `EXPIRE`) | `backend/src/services/seal.service.ts:20-26` | yes, it is the resume point | a Postgres column |
| Media-ready start gate (`HSET`, `HGET`) | `backend/src/services/media.service.ts:12`, `lifecycle.service.ts:34` | yes, it gates starting | a Postgres column |
| Room-open gate and telemetry-seen flag (`HSET`, `HGET`), **new since f3b7b4d** | `lifecycle.service.ts:74,80,97`, `backend/src/sockets/index.ts:164` | `telemetrySeen` yes: a missing key makes `endSession` discard a real interview (`lifecycle.service.ts:99`); `roomOpen` fails safe | Postgres columns, or derive `telemetrySeen` from an observation row |
| Telemetry sequence dedupe (`GET`, `SET`) | `live/ingest.ts:24-32` | dedupe | in-memory (single writer) |
| Rate limits | `backend/src/middlewares/rate-limit.ts:27-30` | abuse control | any rate-limit store |
| Worker to API events (`PUBLISH`, `PSUBSCRIBE events:*`) | `backend/src/utils/events.ts:9`, `sockets/event-subscriber.ts:12` | UI freshness | any pub/sub (NATS, SNS, Postgres `LISTEN/NOTIFY`) |
| Job queue: delayed jobs, flows, schedulers, retries | `utils/queues.ts`, `worker.ts`, `pipeline/flow.ts` | pipeline and link expiry | pg-boss, SQS with a workflow engine, Temporal, Inngest |

A single `REDIS_URL` serves all of it (`backend/src/config/env.ts:35`). No `maxmemory`,
persistence or eviction configuration exists in the repo, and the per-session keys are never freed
(schema audit F1).

**Swap.**
- To a Redis-compatible service (Valkey, ElastiCache, MemoryDB, Azure Cache): **config change**,
  with caveats. BullMQ needs `noeviction` and Lua. Cluster or serverless variants restrict
  multi-key Lua and change pattern-subscribe behavior. Per-command billing (some serverless
  offerings) makes the tick rate a cost driver.
- To a non-Redis store: **rewrite of the live path's state layer** (lease, chain head, frame
  buffer, seal progress, start gate) and a **module rewrite** of the queue (6 files import BullMQ).
  The pipeline steps are portable: each re-queries Postgres for its inputs and never reads a queue
  return value (`backend/src/pipeline/step-runner.ts:6-15`).

**What breaks at 100k.** About 125,000 to 175,000 commands per second from ticks alone is at or past
what one Redis node comfortably serves, and the emitter issues three sequential awaited commands
per frame instead of a pipeline. Queues, live state and rate limits share one instance and one
failure domain.

### 2.3 socket.io

**How tightly coupled.**

- Server: only two files import it, `backend/src/sockets/index.ts` and `sockets/emitter.ts`. The
  rest of the code emits through `emitToInterviewers` and `emitToCandidate`, 21 call sites. That
  is a real seam. Inbound traffic goes through `registry.get(sid).handleX(...)`, so `SessionRuntime`
  and the scoring engine are transport-neutral.
- The seam carries semantics that are specific to socket.io: the `/interviewer` and `/candidate`
  namespaces are the trust boundary that keeps scores away from candidates
  (`sockets/index.ts:46-47`, `emitter.ts:28,40`); acknowledgements (`session.join`, `note.add`);
  rooms named `session:{sid}`; `fetchSockets()` for presence (`emitter.ts:35`); and reconnection
  plus a client-chosen `connId` for sequence dedupe.
- Client: `socket.io-client` is imported in two files (`frontend/lib/candidate/socket.ts`,
  `frontend/lib/live/socket.ts`), but nine files touch the socket API directly: the telemetry
  reporter and editor sync (`frontend/lib/candidate/telemetry.ts:235-240,287-293`), the browser
  camera analysis (`cv.ts`), both WebRTC signalling clients (`lib/candidate/rtc.ts`,
  `lib/live/rtc.ts`), `lib/live/use-live-video.ts`, the dashboard hook, which registers 16
  `socket.on` handlers (`lib/live/use-live-room.ts`), and the candidate room component.
- **New since f3b7b4d:** the server now also relays WebRTC signalling between the two namespaces and
  ingests camera events and session violations (`backend/src/sockets/index.ts:89-97,183-235`). The
  candidate-to-interviewer relay looks the target socket up by id in the local namespace
  (`:189-190`), which only works on the instance that holds that socket. That is one more piece of
  socket.io-specific behavior a transport swap or a second instance has to reproduce.
- The protocol is defined by socket.io behavior plus the zod schemas in
  `backend/src/sockets/events.ts`. There is no wire specification outside the code.

**Swap.** To plain WebSocket, SSE plus HTTP, or a managed realtime service: **module rewrite**,
small on the server and about 6 files on the client, and it means re-specifying acknowledgements,
rooms, replay and reconnect behavior. `SessionRuntime` and detectors do not change.

**Scaling out is a live-path rewrite regardless of transport.**

- No Redis adapter is installed (`backend/package.json` has none). `Phases.md:230` lists
  horizontal scaling as deferred.
- `Architecture.md:83` says the Socket.IO Redis adapter plus the fusion lease "already guarantees
  one writer per session". As coded, the lease is not enforced: `start()` ignores the result of
  `SET ... NX` (`session-runtime.ts:109`) and renewal sets the key unconditionally (`:125`), so two
  runtimes can both hold "the lease".
- Emission goes to the local `io`, so an interviewer connected to instance B does not receive frames
  produced by a runtime on instance A. And every API instance subscribes to `events:*` and pushes
  each worker event through `emitToInterviewers` (`sockets/event-subscriber.ts:16-23`), which
  increments the shared frame sequence and appends to the shared replay buffer once per instance
  (`emitter.ts:21-30`): with N instances, every worker event is buffered N times.
- Multi-instance therefore needs session-affinity routing (an ingress rule keyed on the session
  id), the adapter, a real lease, and de-duplicated event handling.

**Hosting limits.** Interviews run 60 to 120 minutes. Managed load balancers and API gateways
impose idle and maximum connection durations. A forced reconnect resets `connId` and shows up as a
sequence gap and unscored windows (`session-runtime.ts:254-261`).

### 2.4 Postgres-specific features

**In use:** 29 native enums; `JSONB` in a dozen-plus columns; scalar and enum arrays;
`BIGSERIAL` ids on four tables; `createManyAndReturn` (RETURNING); case-insensitive search via
Prisma `mode: "insensitive"` and one raw `unnest(...) ILIKE`
(`backend/src/services/candidate-directory.service.ts:119-121`); `TIMESTAMP(3)`; cascading foreign
keys.

**Not in use:** extensions, functions, triggers, `LISTEN/NOTIFY`, advisory locks, row-level
security, partitions. Migrations are plain SQL and replayable
(`backend/prisma/migrations/*/migration.sql`); `_prisma_migrations` is the only Prisma-specific
artifact.

**Swap.**
- Another Postgres-protocol service (RDS, Aurora, Cloud SQL, AlloyDB, Neon, Supabase):
  **config change**: connection string, TLS, pool or proxy settings. Watch prepared-statement
  behavior behind proxies and connection limits on serverless variants.
- CockroachDB or YugabyteDB: **mostly config**, but sequence semantics differ and the interactive
  transactions (flag merges, `flag-builder.ts:85-120`) need retry handling: module changes in the
  live path.
- MySQL, SQL Server, SQLite, a document store: **rewrite of the live path.** Enum arrays, JSON
  behavior, `createManyAndReturn` (unsupported on MySQL) and `mode: "insensitive"` all change.

**What breaks at 100k.** A single primary at about 15,000 write statements per second and over
100 GB per day needs partitioning and probably replicas for dashboard reads. Partitioning is
Postgres-native but Prisma-blind (section 2.1), so the more you scale, the more you commit to
hand-written Postgres SQL. BIGSERIAL ids also do not merge across writers, which matters if you
ever go multi-region.

### 2.5 The other dependencies, briefly

| Dependency | Coupling | Swap |
|---|---|---|
| Object storage | Interface with five methods (`backend/src/providers/storage/storage.provider.ts:10-17`); env enum allows only `local` (`env.ts:45`); DB keys are opaque (`orgs/{orgId}/sessions/{sessionId}/...`). Local disk needs a shared persistent volume: the API writes evidence at seal and the worker reads it, and the worker writes reports the API serves (`backend/Dockerfile` `VOLUME`, `docker-compose.yml` shared `storage` volume) | **Module addition.** An S3-compatible provider fits the interface. Blocker on any managed container host with ephemeral per-instance disks. `getBuffer` loads whole objects into memory |
| Docker sandbox | Interface with one method, now with three implementations selected by `SANDBOX_PROVIDER`: `mock`, `docker`, and (**new since f3b7b4d**) `local`, which runs code on the API host with no isolation (`backend/src/providers/sandbox/local.sandbox.ts`, `providers/index.ts:36-38`). The Docker implementation needs a Docker daemon and bind-mounts a temp directory by host path (`docker.sandbox.ts:87,97-102,154`) | **Module addition** (hosted runner, Firecracker or gVisor service, remote executor). Three working implementations behind one interface is evidence the seam holds. Docker is not runnable on managed hosting as built (security audit SB-5), and `local` must not be selectable in production (SB-7) |
| Media | The server-side `MediaProvider` is still a four-method mock shaped like an egress model (`egressId`, HLS and composite URIs, participant tokens, `backend/src/providers/media/media.provider.ts:11-18`), and the `Recording` table bakes that shape into the schema (`backend/prisma/schema.prisma:803-818`); `Architecture.md:28` names LiveKit. **New since f3b7b4d:** what actually runs is browser-to-browser WebRTC with signalling over the socket (`frontend/lib/candidate/rtc.ts`, `frontend/lib/live/rtc.ts`, `backend/src/sockets/index.ts:89-97,183-195`) and Google's public STUN servers by default (`frontend/lib/rtc-config.ts:3`). No media server, no server-side recording | **The decision is still open, and it is the most consequential one.** Peer-to-peer cannot be recorded server-side and does not scale to multiple interviewers; adding recording means introducing a media server (LiveKit or similar) and mapping it onto the egress-shaped columns. Until then the `Recording` columns are unused. Choose the vendor with that in mind |
| Browser camera analysis (**new since f3b7b4d**) | MediaPipe `@mediapipe/tasks-vision` plus model files served from the frontend (`frontend/package.json`, `frontend/public/mediapipe/`: a face landmarker, a COCO object detector, and three WASM builds, about 44 MB in total). All logic in `frontend/lib/candidate/cv.ts`; the server sees only three or four event types | **Module rewrite of one client file** if you replace the model or move analysis server-side. It ties the candidate experience to Google's runtime and to the candidate's device performance (`PREFLIGHT_MIN_CPU_CORES`, `backend/src/config/constants.ts`). The server-side contract (`cv.batch` types mapped to channels, `contracts/detector-registry.json`) is vendor-neutral |
| LLM provider | Vendor-neutral interface returning domain objects (`backend/src/providers/llm/llm.provider.ts:37-42`); env enum allows only `mock` | Low; nothing vendor-specific exists yet |
| Signer | Synchronous interface with one key (`backend/src/providers/signer/signer.ts:7-11`); called at `evidence.service.ts:225-239` and `:310-314`; verification requires the configured key id (`:314`) | **Small module rewrite** to make it async for a KMS, **plus a keyring** so retired keys still verify old sessions |
| Mail | Interface, SMTP via nodemailer | Config change (any SMTP relay) |
| Queue (BullMQ) | 6 files; flow tree, exponential retries, delayed jobs, cron scheduler (`pipeline/flow.ts:150-185`, `worker.ts:38-42`) | **Module rewrite.** Steps are portable (above) |
| Frontend | Next.js 16, self-hostable with `next start`; I found no Vercel-specific API. Third-party runtime dependencies: Monaco loaded from `cdn.jsdelivr.net` (`frontend/node_modules/@monaco-editor/loader/lib/es/config/index.js:3`), avatars from `api.dicebear.com`, image pattern `images.unsplash.com` (`frontend/next.config.mjs:4-14`) | Self-host Monaco and render avatars locally; cheap |
| Runtime | Node 22 image (`backend/Dockerfile`), TypeScript 7.0.2, Express 5, ESM. `argon2` is a native addon and the Dockerfile explicitly avoids alpine for it. `puppeteer` is a production dependency, but the slim runtime image carries none of Chromium's system libraries, and PDF is off by default (`env.ts:63`) | Base image and runtime choices constrain serverless and distroless targets; PDF would need a different image |

---

## 3. What becomes hard to replace

Ranked by how much code would have to move:

1. **The in-process live runtime model** (registry map, local `io`, timers, unenforced lease). This
   is what forces session-affinity routing, and it means a rolling deploy destroys the fusion state
   of every session it interrupts (the state is not checkpointed, `session-runtime.ts:95-97`),
   despite `Architecture.md:366` saying it is. There is no drain: a session left LIVE by a dead
   process has no runtime and no duration timer.
2. **Redis-resident state and BullMQ.** Chain head, seal progress, the start gate and the `roomOpen` and `telemetrySeen` flags live outside
   the database, so a database-only backup, restore or migration does not carry them.
3. **Prisma-generated enums as the domain model** (47 files) and Prisma call sites in the live path.
4. **The evidence key and format.** One key, no keyring, and verification that runs only on the
   server (security audit EV-3, EV-4).
5. **Socket.IO semantics duplicated in two clients**, with no published wire contract.

## 4. Data portability

What leaves cleanly:

- **Postgres:** `pg_dump` works, migrations are plain SQL, ids are text (`cuid`, ULID) or
  `BIGSERIAL`.
- **Evidence:** the per-session export is gzipped ndjson plus `manifest.json` and `manifest.sig`
  under stable keys (`evidence.service.ts:200-217`).
- **Object storage keys** are opaque strings in the database, so copying the tree preserves them.

What does not, or needs care:

- **Redis state.** The chain head, seal progress and the `telemetrySeen` flag are needed to resume or correctly end an in-flight session and
  are not in the database. Queued and delayed jobs are lost on a cutover; drain first.
- **Independent evidence verification is not possible.** The public key is not exported anywhere,
  and verification is the server checking itself. After any key rotation or KMS move, existing
  sessions fail verification (`evidence.service.ts:314`) unless you keep the old key.
- **Secrets are data.** `HASH_PEPPER` produces the consent IP and user-agent hashes
  (`backend/src/utils/hash.ts:9-12`, `backend/src/services/join.service.ts:190-191`); losing or
  rotating it makes those hashes incomparable. The join and candidate token secrets have no key id,
  so rotation invalidates every outstanding link and token.
- **Unversioned JSON blobs.** `Report.model`, `methodology`, observation `payload` and JD `parsed`
  are free-form JSON. I did not find a schema-version field in the report model, so old reports can
  be misread by newer code.
- **`BIGSERIAL` ids** on `observations`, `integrity_snapshots`, `editor_deltas` and `audit_logs`
  conflict if you ever merge or shard writers.
- **Hard deletes.** Retention deletes rows outright, so a migration cannot reconstruct what was
  removed; only the audit-log receipts remain.

## 5. Dependency limits that start to hurt, in the order you will hit them

1. **Horizontal scaling of the API** (section 2.3). The first hard wall, and it arrives with the
   second instance.
2. **Postgres connections.** Pool of 10 per process, so with 10 to 20 processes you are at 100 to
   200 connections with no proxy; add PgBouncer and set `max` explicitly.
3. **Object storage.** Local disk fails as soon as more than one instance or an ephemeral container
   filesystem is involved.
4. **Worker throughput.** One process runs four workers at concurrency 1
   (`worker.ts:24-34`), and one JD-parse job can stall the evidence pipeline behind it
   (security audit RA-4). At about 3,600 sessions per day per worker under my assumptions, 100k
   sessions per day needs on the order of 28 worker processes or a concurrency change.
5. **Redis single instance and unpipelined commands** (section 2.2).
6. **Postgres write volume** (section 2.4): partitioning and retention mechanics.
7. **Sandbox execution capacity and placement**, which cannot be met on managed hosting as built.

## 6. What could be done today, cheaply, without rewriting anything

All of these are small additions or configuration. None changes behavior.

1. **Add an S3-compatible `StorageProvider`.** The interface already exists; this removes the
   biggest managed-hosting blocker and adds an enum value.
2. **Split `REDIS_URL` into a queue URL and a state URL.** The code already creates two kinds of
   connections (`backend/src/utils/redis.ts:9-31`). It lets you put BullMQ on a persistent
   `noeviction` instance and live state on a volatile one, and lets you later move live state off
   Redis without touching the queues.
3. **Define the domain enums in one module** that re-exports Prisma's generated enums, and import
   from that module everywhere, so the scoring engine and validators stop importing
   `generated/prisma` directly. 47 imports become one, and an ORM change touches one file.
4. **Put two narrow ports in front of the live path's persistence**: an evidence store (append
   observations, read the head) and a live store (snapshots, warnings, unscored windows). The 15
   sensitive Prisma call sites move behind them. This is the boundary that makes the live path
   movable.
5. **Enforce the seams with a lint rule** (`no-restricted-imports` or dependency-cruiser): only the
   store modules import `utils/prisma`, only `utils/redis` and the queue module import ioredis and
   BullMQ, only `sockets/` imports socket.io. There is no CI today, so start by running it
   locally.
6. **Make `Signer` asynchronous and add a keyring lookup by `signingKeyId`** in verification. It is
   two call sites, it makes a KMS move possible, and it keeps old sessions verifiable.
7. **Publish the wire protocol as JSON Schema** alongside `contracts/detector-registry.json`,
   generated from the zod schemas in `sockets/events.ts`. That turns a future transport change into
   an implementation of a spec instead of a redesign.
8. **Set the Postgres pool size explicitly** in the `PrismaPg` config and make the app tolerate
   PgBouncer in transaction mode.
9. **Self-host Monaco and render avatars locally.** It removes two third-party runtime
   dependencies from a proctored page.
10. **Add key ids to the JWT secrets** (jose supports `kid`) and a version field to `Report.model`,
    so rotation and schema evolution stop being breaking changes.
11. **Move the chain head, seal progress, start gate and the `roomOpen` and `telemetrySeen` flags into Postgres columns** (or a table). It is
    a small change and it removes the biggest reason a database-only migration is incomplete.
12. **Write a one-page exit note**: how to dump Postgres, copy storage, export the public key and
    which secrets must move with the data.

## 7. What I did not check

- **Nothing was executed.** No load test, no measured throughput, no profiling. The per-process
  session capacity and worker throughput figures are assumptions I made, labeled as such.
- **No production topology exists in the repo.** Hosting, proxies, TLS, managed-service limits and
  pricing are unknown, so the managed-hosting points are judged against the dev compose file and
  the Dockerfile only.
- **Vendor behavior was not tested.** Statements about Aurora, Neon, serverless Redis, Redis
  Cluster and BullMQ compatibility are from general knowledge of those products, not from trying
  them, and should be verified before relying on them.
- **Not read in full:** the frontend beyond the socket, telemetry, API client and, for the code added since `f3b7b4d`, `cv.ts` (first 80 lines), `rtc.ts` (first 70 lines) and the `candidate-room.tsx` diff;
  `MockLlmProvider` and `SmtpMailProvider`; most controllers. Coupling counts come from grep over
  `backend/src` and `frontend`, excluding `generated` and `node_modules`.
- **`ml/`** was not read beyond confirming it has no database access. The only contract with the
  backend is `contracts/detector-registry.json`, which both sides test against; that is a
  well-shaped, vendor-neutral seam.

I have not acted on any of this and have opened no follow-up.
