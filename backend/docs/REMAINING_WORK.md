# VeriTrust Backend — What's Left

**As of:** 2026-09-18. All 11 phases in `Phases.md` are complete — there is no unfinished planned
phase. This document is everything real that's still missing, deferred, or worth a second look,
organized by how much it matters. For what already exists, see [`STATUS_REPORT.md`](STATUS_REPORT.md).
For the full paper trail behind every item below, see [`Memory.md`](Memory.md)'s Known issues and
Decisions log — this file is the "so what do I do next" summary of that, not a replacement for it.

---

## 1. Blocking a real deployment (do these first)

- ~~No process auto-starts `npm run worker`~~ **Resolved.** A `Dockerfile` (multi-stage, no native
  Prisma engine binary to worry about — see its own comments) and `docker-compose.yml`'s opt-in
  `app` profile now define `api`/`worker`/`migrate` as separate deployable services. Built, actually
  run, and driven through a real session end-to-end against the containerized stack this session
  (register → live → end → real BullMQ pipeline via the containerized worker → COMPLETE), including
  verifying `SIGTERM` is handled directly (exec-form `CMD`) by both processes. See
  [`README.md`](../README.md)'s "Deploying" section for what a real deployment still has to supply
  itself (real secrets, `NODE_ENV=production`, a persistent volume for local storage, running the
  worker as its own long-lived service). This local Dockerfile smoke test also caught and fixed two
  real bugs — see §1a below.
- **Every provider except storage/mail is a mock.** `LLM_PROVIDER=mock`, `MEDIA_PROVIDER=mock` (no
  real LiveKit egress — recordings never actually populate `compositeUri`/`hlsUri` in this build),
  `SANDBOX_PROVIDER` defaults to `mock` (real Docker sandbox exists and works but isn't the default).
  **Action:** wire real providers behind the existing interfaces (`providers/*.provider.ts`) — LLM
  (JD parsing/suggestions/grading), LiveKit media egress, and flip `SANDBOX_PROVIDER=docker` in
  whatever environment has a Docker daemon.
- **The frontend is not connected to this API at all.** Confirmed by grep earlier this session: the
  Next.js frontend is 100% `lib/mock-data/*`, zero calls to this backend or its sockets. Every
  endpoint and event in this report exists and works, but nothing in the UI uses it yet. This is by
  far the largest remaining item — **Action:** wire the frontend's data layer to the real REST API and
  Socket.IO namespaces described in `STATUS_REPORT.md` §4–5 / `Design.md`.
- **The 60-minute load-test target was only smoke-tested for 5 minutes** in this session
  (`scripts/load-test-telemetry.ts`, zero backlog throughout). **Action:** run the full spec
  unattended (`tsx scripts/load-test-telemetry.ts`, no `LOAD_TEST_DURATION_SECONDS` override) once
  against whatever environment will actually host this, before treating Phase 11's load-test item as
  fully signed off for that environment.

### §1a. Two real deployment bugs the Docker smoke test caught and fixed

- **`logger.ts` would hard-crash on boot** if `NODE_ENV` was anything other than exactly
  `"production"`/`"test"` in a production-built image — `pino-pretty` (the dev-only pretty-printer)
  is never installed in that image's `node_modules` (`npm ci --omit=dev`), so requesting its
  transport threw `"unable to determine transport target"` and took the whole process down before
  it logged a single line. Reproduced live: the local `.env`'s `NODE_ENV=development`, injected via
  `docker-compose.yml`'s `env_file: .env` for the local smoke-test profile, was exactly this
  misconfiguration. Fixed two ways: `docker-compose.yml`'s `app` profile now explicitly forces
  `NODE_ENV: production` for `api`/`worker`/`migrate` (a real deployment must do the same — see
  README), **and**, since forgetting that one env var shouldn't be able to crash-loop a container,
  `logger.ts` now falls back to plain JSON output if the pretty transport can't be loaded, instead of
  throwing.
- **The `worker` container's inherited `HEALTHCHECK` could never pass.** The `Dockerfile`'s
  `HEALTHCHECK` probes the API's `GET /api/v1/ready` over HTTP; `worker.js` never opens a port, so
  that check would report unhealthy forever if left as-is. `docker-compose.yml`'s `worker` service
  now explicitly disables it.

## 2. Real gaps worth planning for, not urgent

- **`npm audit` has 3 open findings**, all only fixable via `npm audit fix --force` (forbidden by this
  project's own rules — would downgrade Prisma or bump dockerode's major version). All three are
  dev-tooling-only (Prisma CLI's MySQL/config-merge code, never touched — this app only uses `pg`) or
  gated behind the optional `SANDBOX_PROVIDER=docker` path. Revisit when Prisma/dockerode ship a
  non-breaking fix upstream.
- **No LiveKit webhook infrastructure exists** (`webhooks/livekit`, named in `Architecture.md` §8 but
  never built in any phase). This blocks several small features that depend on real media-track
  truth: media-track grace (camera/screen loss → clock freeze + unscored window), the
  "visible-while-screen-muted" impossible-state audit check, and the `SCREEN_SHARE_STOPPED` warden
  warning template (the only one of 9 Design.md warning types still unworded). All three need a real
  media provider first (see §1) — no point building the webhook against the mock.
- **No key-rotation store for evidence signing** — `EvidenceManifest` only verifies against the
  *current* `EVIDENCE_SIGNING_KEY_ID`. A session sealed under a since-rotated key would report
  `signatureValid: false`, indistinguishable from real tampering. Fine for a single long-lived key;
  add a historical-key lookup before ever rotating `EVIDENCE_SIGNING_PRIVATE_KEY` in production.
- **`Engine`/fusion state has no crash-resume.** A process crash mid-LIVE loses the in-memory fusion
  accumulator and editor-delta dedup state (all raw evidence is still safe in Postgres, so
  `IntegrityRescore` is unaffected — only the *live* dashboard score would reset to 100 until new
  evidence arrives). No worse than before this session, just worth knowing before relying on
  long-running LIVE sessions surviving a deploy.
- **`sealSession()` has no lock against concurrent invocation** (e.g. an interviewer's `POST /end`
  racing a boot-time `resumeStuckSeals()` at the exact same instant). Every individual step is either
  a DB-level CAS or naturally idempotent, so a race would do some duplicate work, not corrupt state —
  but it's not guarded the way the fusion lease guards concurrent LIVE writers.

## 3. Small, specific, low-risk gaps

- Two composite-score sub-formulas (`technical` = mean(correctness, depth, handsOn) blended 50/50
  with code hidden-test pass rate; `communication` = mean(structure, specificity)) were invented this
  build since neither PRD nor Architecture named the exact blend — flagged to the user in the Phase 10
  handoff, never explicitly confirmed. Worth a deliberate sign-off pass if scoring accuracy is being
  scrutinized.
- `supersededByReview`'s definition (≥1 adjudication, any action) is likewise an interpretation, not a
  spec quote — same "worth confirming" status.
- No `.ics` calendar attachment on scheduled-mode invite emails (`Phases.md` mentions one); invite
  emails are plain text today. Low priority until a real SMTP provider is wired up anyway.
- No org-invite-by-email flow — `POST /org/members` requires the target user to already have an
  account. Fine for now; would matter once onboarding a new org from scratch is a real flow.
- `GET /sessions` pagination filters `scheduledAt` by `from`/`to`, which silently excludes
  DIRECT_LINK sessions (no `scheduledAt`) from any date-filtered query. Revisit if DIRECT_LINK
  sessions need date filtering by `createdAt` instead.
- Notes have no media-offset anchor yet (`mediaOffsetMs` always null on `Note`) even though
  `Recording.egressStartedAt`/`MediaIndex` now exist — only flags got wired to the media index in
  Phase 10. Small follow-up if the dashboard wants notes clickable-to-timestamp too.
- `timer.tick`'s `topics: [{name, budgetSeconds, usedSeconds}]` (Design.md §5.2) is still unbuilt —
  only `{elapsedMs, remainingMs, frozen: false}` is emitted. No live topic-tracking mechanism exists
  anywhere. `frozen` is hardcoded `false` (needs the same media-webhook work as §2's grace item).
- `GET /sessions/:id/live`'s hydrate payload is still missing `transcriptTail`, `suggestions`,
  `degraded` from Design.md §4.10's full shape — a dashboard that was already open doesn't miss
  anything (the socket already pushes all three live), only a fresh page reload mid-session would.
- `suggestion.service.refreshSuggestions` only supports the manual `POST .../refresh` trigger, not
  the automatic "topic change"/"answer end" triggers `Phases.md` also lists — both need live
  topic-tracking and ASR turn-detection that don't exist yet (same root cause as the `timer.tick`
  topics gap above).

## 4. Cross-component note

`ml/` (the Python fusion-engine calibration lab) is a **separate, non-integrated** component —
`backend/`'s TypeScript live engine is the canonical scorer and does not import or call anything in
`ml/`. This was a deliberate architecture decision, not an oversight — see
[`../../docs/cross-component-architecture.md`](../../docs/cross-component-architecture.md). One real,
intentional divergence between the two: this backend's live engine accumulates LLR through the
calibration window and only gates flag *emission*; `ml/`'s engine gates accumulation too. Both
`IntegrityRescore` (here) and `ml/`'s replay deliberately match their own component's live behavior,
not each other's. Revisit only if the two engines are ever meant to converge on one behavior.

## 5. What's genuinely done and doesn't need revisiting

Worth stating explicitly so it isn't re-litigated: the session state machine, the evidence hash chain
+ signed manifest, the full 8-step post-processing pipeline, the live fusion/flag/warden loop, the
coding round (including a real Docker sandbox), auth/org/RBAC, retention, and the REST/socket surface
in `STATUS_REPORT.md` are all built, tested, and were just verified live end-to-end against a real
running server. None of that is "remaining work."
