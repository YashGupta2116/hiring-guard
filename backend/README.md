# VeriTrust Backend

Interview-integrity platform API: session lifecycle, live monitoring (candidate telemetry → fusion
engine → flags), evidence hash chain, post-processing pipeline, and reports.

Express 5 + TypeScript (ESM) + Prisma 7 + PostgreSQL + Redis + BullMQ. See
[`docs/Architecture.md`](docs/Architecture.md) for the full design, [`docs/Design.md`](docs/Design.md)
for exact endpoint/event/error-code shapes, and [`docs/PRD.md`](docs/PRD.md) for requirement IDs
(`FR-*`). [`docs/Phases.md`](docs/Phases.md) and [`docs/Memory.md`](docs/Memory.md) track what has
been built and what's next.

## Setup

Requires Node.js ≥ 22 and Docker.

```bash
npm install
docker compose up -d              # postgres, redis, mailpit (mail UI at http://localhost:8025)

cp .env.example .env
npm run keys:generate              # prints HASH_PEPPER / JWT_ACCESS_SECRET / JOIN_TOKEN_SECRET /
                                    #   CANDIDATE_TOKEN_SECRET / EVIDENCE_SIGNING_PRIVATE_KEY — paste
                                    #   the printed lines into .env

npm run db:migrate -- --name init  # only needed once, if prisma/migrations is empty

npm run typecheck && npm test      # should print 0 typecheck errors and all tests passing
```

Then, in separate terminals:

```bash
npm run dev      # API on :9000 — GET /api/v1/ready should return {"data":{"db":"ok","redis":"ok"}}
npm run worker   # BullMQ workers: jd-parse, link-expiry, pipeline (report generation), retention
```

A session that reaches `PROCESSING` (post-interview report generation) or has a join link armed
needs `npm run worker` running to actually progress — the API process alone won't advance either.

## Environment variables

Full list with defaults: [`.env.example`](.env.example). Everything is parsed and validated once in
[`src/config/env.ts`](src/config/env.ts) — `process.env` is never read anywhere else. Groups:

- **Server**: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `APP_URL`, `API_URL`, `CORS_ORIGINS`.
- **Data**: `DATABASE_URL`, `REDIS_URL`.
- **Secrets** (`npm run keys:generate`): `HASH_PEPPER`, `JWT_ACCESS_SECRET`, `JOIN_TOKEN_SECRET`,
  `CANDIDATE_TOKEN_SECRET`, `EVIDENCE_SIGNING_PRIVATE_KEY`/`EVIDENCE_SIGNING_KEY_ID`,
  `INTERNAL_SERVICE_TOKEN`.
- **Providers**: `STORAGE_PROVIDER`/`STORAGE_LOCAL_DIR`, `MAIL_PROVIDER`/`SMTP_*`, `LLM_PROVIDER`,
  `MEDIA_PROVIDER`, `SANDBOX_PROVIDER` (`mock` or `docker`). Every provider is mockable for local
  dev without external services — see [`src/providers/index.ts`](src/providers/index.ts).
- **Reports**: `REPORT_PDF_ENABLED` (puppeteer PDF is optional; HTML is always produced).
- **Retention** (Phase 11, [`src/services/retention.service.ts`](src/services/retention.service.ts)):
  `RETENTION_MEDIA_DAYS` (90), `RETENTION_OBSERVATIONS_DAYS` (180),
  `RETENTION_EVIDENCE_LOG_FLOOR_DAYS` (30), `RETENTION_REPORTS_DAYS` (1095),
  `RETENTION_CRON` (nightly, `0 3 * * *`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API server, watch mode |
| `npm run worker` | Background workers (JD parse, link expiry, pipeline, retention), watch mode |
| `npm run build` / `npm start` | Compile and run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run db:migrate` / `npm run db:deploy` | Prisma migrations (dev / deploy) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Seed data |
| `npm run keys:generate` | Print fresh secrets for `.env` |
| `tsx scripts/load-test-telemetry.ts` | Telemetry ingest load test — see below |

## Architecture at a glance

- **API process** (`npm run dev`): REST (`controllers/` → `services/`), Socket.IO (`/interviewer`,
  `/candidate`), and the live engine (detectors → fusion → warden) for whichever sessions it is
  handling. Single instance in this build.
- **Worker process** (`npm run worker`): BullMQ workers for JD parsing, join-link expiry, the
  post-processing pipeline (8 steps, seal → report), and the nightly retention job.
- **PostgreSQL** via Prisma is the system of record; **Redis** holds live session state, leases,
  buffers and rate limits; object storage (local disk in dev, S3-shaped interface) holds
  recordings, evidence logs and reports.

Full diagram and data flows: [`docs/Architecture.md`](docs/Architecture.md) §3–§7.

## Testing manually

```bash
# Register + create a session
curl -s -X POST http://localhost:9000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Owner","email":"owner@example.com","password":"correct-horse-battery","orgName":"Acme"}'

# Use the returned accessToken as a Bearer token for subsequent requests, e.g.:
curl -s http://localhost:9000/api/v1/sessions -H "Authorization: Bearer <accessToken>"
```

See `tests/integration/*.test.ts` for full request sequences (session → join → consent → live →
end → pipeline → report) that mirror real client flows.

## Load testing telemetry ingest

Phases.md §11 targets one session sustaining 4 telemetry events/s (the client's 250ms batch
cadence) for 60 minutes without the server falling behind. Run it against a live `npm run dev`:

```bash
npm run dev                                                    # separate terminal
tsx scripts/load-test-telemetry.ts                             # full 60-minute run
LOAD_TEST_DURATION_SECONDS=120 tsx scripts/load-test-telemetry.ts   # shorter smoke run
```

It spins up a real session, drives its candidate socket at the target rate, and polls Postgres to
check that persisted observations keep pace with what was sent (no growing backlog). See the
script's own comment header for how it derives an expected observation count.

## Known limitations

See [`docs/Memory.md`](docs/Memory.md) ("Known issues") for the current list — notably: the
frontend is still fully mock-data-driven and not wired to this API, and CV/ASR/real-LLM providers
are interfaces only (`Deferred` in [`docs/Phases.md`](docs/Phases.md)).
