# Rules.md — VeriTrust Backend

These rules apply to any AI assistant (or human) writing code in `backend/`.
If a rule conflicts with a request, **stop and ask** instead of guessing.

---

## 1. Before writing any code

1. Read `Memory.md` first. It says what phase we are in, what exists, and what was decided.
2. Read the relevant section of `Phases.md` for the current phase only.
3. Check `prisma/schema.prisma` and `Design.md` for the exact names of models, fields, endpoints and events.
4. Work on **one phase at a time**. Do not start code for a later phase "while you're at it".
5. If something is missing or ambiguous in the docs, ask a question. Do not invent endpoints, fields,
   env vars or event names.

## 2. After writing code

1. Update `Memory.md`: what was built, files touched, decisions made, known issues, next step.
2. List any new env vars and add them to `.env.example`.
3. List any schema change and the migration name.
4. Say how to test what you built (curl commands or test file).

---

## 3. Stack and libraries

### Use
| Purpose | Library |
|---|---|
| HTTP | `express@5` |
| Validation | `zod` |
| ORM | `prisma@7`, `@prisma/client@7`, `@prisma/adapter-pg@7`, `pg` |
| Redis | `ioredis` |
| Queues | `bullmq` |
| Realtime | `socket.io@4` |
| JWT | `jose` |
| Passwords | `argon2` |
| Uploads | `multer` |
| Logging | `pino`, `pino-http` |
| Security | `helmet`, `cors`, `express-rate-limit`, `rate-limit-redis`, `cookie-parser` |
| IDs | `ulid` (sessions), Prisma `cuid()` elsewhere |
| JD extraction | `pdf-parse`, `mammoth` |
| Email | `nodemailer`, `ics` |
| Media | `livekit-server-sdk` |
| Sandbox | `dockerode` |
| Templates / PDF | `eta`, `puppeteer` (optional) |
| Tests | `vitest`, `supertest`, `socket.io-client` |
| Dev | `tsx` |

### Do not use
- Prisma 8 or `npx prisma@latest` (different migration system). Never run `npm audit fix --force`.
- `ts-node`, `nodemon` (use `tsx watch`).
- `jsonwebtoken` (use `jose`), `bcrypt` (use `argon2`).
- `express-async-handler` or try/catch wrappers around every controller (Express 5 handles async errors).
- `class-validator`, `joi`, `yup` (use `zod`).
- `moment` (use native `Date` / `Intl`).
- `ws` directly, or any second realtime library.
- Any ML / CV / audio library. CV and ASR are external producers.
- Any AWS SDK in this phase (use the provider interfaces).
- CommonJS (`require`, `module.exports`).

Adding a dependency not in this list requires asking first, with a one-line reason.

---

## 4. TypeScript and code style

- ESM only. Relative imports **must** end in `.js` (`import { x } from "./foo.js"`).
- `strict: true`. No `any`; use `unknown` and narrow. No `@ts-ignore`; `@ts-expect-error` only with a comment.
- Prefer `type` for data shapes, `interface` for provider contracts.
- Named exports only. No default exports (except where a library requires it).
- File names: `kebab-case` with a role suffix: `session.service.ts`, `session.controller.ts`,
  `session.routes.ts`, `session.schema.ts`, `focus.detector.ts`.
- Functions small and single-purpose. No file over ~300 lines; split it.
- No commented-out code. No silent `TODO`s — if something is deferred, say so in `Memory.md`.
- Constants (timings, caps) live in `src/config/constants.ts`; detection tunables in `src/config/detection.ts`.
  **No magic numbers** in services or detectors.
- Environment is read only through `src/config/env.ts`. Never `process.env.X` elsewhere.

---

## 5. Layering

```
routes → controllers → services → utils / providers / prisma
```

- **Routes**: path + middleware + controller. Nothing else.
- **Controllers**: read validated input from `req`, call **one** service function, send response with
  `respond.ts` helpers. No Prisma, no business rules.
- **Services**: all business logic, authorisation checks on data, transactions. No `req`/`res`.
- **Providers**: every external system (LLM, media, sandbox, storage, mail, signer) behind an interface
  with a mock implementation. Services depend on the interface, never on the concrete library.
- **live/**: pure engine code. Detectors and `fusion.engine.ts` are **pure functions / classes with no I/O**
  so they are unit-testable.

---

## 6. Validation

- Every route uses `validate({ body?, query?, params? })` with a zod schema from `validators/`.
- Every socket event payload is parsed with its zod schema from `sockets/events.ts`. Invalid payloads
  are dropped and logged (for candidate telemetry, never disconnect for one bad batch).
- Parse, don't cast: use the parsed output, never `req.body as X`.
- Uploads: check MIME type **and** magic bytes; 10 MB cap enforced in multer.

---

## 7. Error handling

- Throw `AppError` from services: `throw new AppError("INVALID_STATE_TRANSITION", "Session is not ADMITTED", { status })`.
  Error codes are listed in `Design.md` §3. Do not invent new codes without adding them there.
- One global `error-handler.ts` converts errors to the error envelope:
  - `AppError` → its status and code.
  - `ZodError` → `400 VALIDATION_FAILED` with `details`.
  - Prisma `P2002` → `409 CONFLICT`; `P2025` → `404 NOT_FOUND`.
  - `MulterError LIMIT_FILE_SIZE` → `413 PAYLOAD_TOO_LARGE`.
  - Anything else → `500 INTERNAL`, logged with stack, **generic message to client**.
- Never send stack traces, SQL, or internal messages to clients.
- Never swallow errors. `catch` only to add context, convert, or implement a documented fallback
  (e.g. JD parse failure → `parseStatus = FAILED`).
- Workers: let BullMQ retry by throwing; mark step FAILED on final attempt.
- Socket handlers: wrap in a helper that logs and emits a generic `error` event; never crash the process.
- Process: handle `SIGTERM`/`SIGINT` gracefully (stop accepting, drain sockets, close Prisma/Redis).
  Log `unhandledRejection` and exit non-zero.

---

## 8. Database rules

- Use the Prisma client from `utils/prisma.ts` only. Never create another `PrismaClient`.
- **Every** query on org data filters by `orgId` (directly or through the session). No exceptions.
- Multi-write operations use `prisma.$transaction`.
- Session status changes **only** via `session-state.service.ts` `transition()` (CAS with `updateMany`
  + audit log in the same transaction). Never `prisma.interviewSession.update({ data: { status } })` elsewhere.
- Append-only: never update or delete `observations`, `flag_adjudications`, `consents`, `audit_logs`
  (except the retention job).
- **Never delete flags.** Offline review sets `supersededByReview = true`. Adjudication creates a row and
  updates `status`/`severity`, it does not overwrite history.
- Select only the fields you need for list endpoints. Paginate every list.
- Do not change `schema.prisma` without saying so explicitly and creating a named migration
  (`npx prisma migrate dev --name <what_changed>`).
- Use `BigInt` ids carefully: serialise to string in responses.

---

## 9. Security and privacy rules

- Passwords with argon2id. Refresh tokens stored as SHA-256 hash only. Rotate on every refresh; reuse of a
  rotated token revokes the whole family.
- Join tokens: verify signature **and** DB state (`jti` exists, not revoked, not consumed, in window) on every call.
- IP and user agent are stored as `HMAC-SHA256(HASH_PEPPER, value)`. Never store raw IP/UA.
- Never log: passwords, tokens, raw IP/UA, JD text, transcript text, code content, keystroke data.
  Log IDs and counts instead.
- Rate limits: `/auth/*` 10/min per IP; `/join/*` 30/min per token; code run 1 per 3 s per session task.
- CORS restricted to `CORS_ORIGINS`. `helmet()` on.
- Signed URLs / file downloads only after the same authorisation check as the JSON endpoint.

### 9.1 Candidate boundary (hard rule)

Anything reachable with a join token or candidate token, and anything emitted on the `/candidate`
namespace, **must never include**:
- any score (integrity, sub-scores, composite), flag, flag count, severity, narrative, evidence frame;
- any threshold, weight, sensitivity or machine-readable channel list;
- hidden test inputs, outputs or pass counts;
- report data.

Implement candidate responses with **explicit allow-list DTOs** (build the object field by field; never
spread a Prisma row). There must be an automated test that scans candidate payloads for forbidden keys.

### 9.2 Fairness rules
- Warning text comes only from templates in `live/warden.ts`. Wording states the observation and the
  requirement, never an inference. The words "cheat", "cheating", "suspicious", "fraud" must not appear in
  any candidate-facing string.
- Signal loss, disconnection, sequence gaps and detector failures never create positive evidence.
  They open unscored windows.
- Extended display: warning with zero weight.
- No flags or warnings during calibration (first 60 s of LIVE).
- Grading rubric must not score accent, fluency, grammar, pace or silence.

---

## 10. Realtime rules

- Only `SessionRuntime` writes observations, fusion state, flags and warnings for a LIVE session, and only
  while holding the Redis lease.
- All dashboard emits go through `sockets/emitter.ts` (adds frame seq, writes to `s:{sid}:buf`).
- Socket auth happens in namespace middleware; after connect, the socket joins room `session:{sid}` only
  after the same access check as REST.
- Event names are constants from `sockets/events.ts`. No string literals in handlers.
- Candidate telemetry: accept, correct clock, check seq, dedup. Never trust client timestamps without
  correction. Never let client input set scores, thresholds or flag state.

---

## 11. Logging

- `pino` JSON. Every log line in a request carries `requestId`; in live/seal/pipeline code also `sessionId`.
- Levels: `error` (needs attention), `warn` (degraded but handled), `info` (state transitions, jobs),
  `debug` (per-event detail, off in prod).
- Do not log per telemetry event at `info`.

---

## 12. Testing

- Unit tests for every detector, `fusion.engine`, `warden`, hash chain, composite score, state machine.
- Integration tests (supertest) for each phase's endpoints, including authorisation failure cases.
- The candidate-boundary test (§9.1) must stay green.
- Tests use a separate database (`DATABASE_URL` in `.env.test`) and reset between suites.
- A phase is not done until `npm run build` and `npm test` pass.

---

## 13. What the AI should and should not do

**Should**
- Follow the folder structure in `Architecture.md` exactly.
- Show complete files, not fragments with `...`, unless editing a clearly identified section.
- Keep mocks realistic and deterministic so the whole flow can be demoed without ML, LiveKit or Docker.
- Point out when a request conflicts with these rules or the PRD.
- Keep responses focused on the current phase.

**Should not**
- Rewrite working files unrelated to the task.
- Change constants in `detection.ts`/`constants.ts`, the state machine, or the scoring formula without being asked.
- Add ML models, fake "AI detection", or any logic that infers cheating from a single signal.
- Put secrets in code or commit `.env`.
- Mark a phase complete in `Memory.md` if build or tests fail.
