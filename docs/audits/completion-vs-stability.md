# VeriTrust: feature completion vs. long-term stability

Read-only audit of `/Users/yashgupta/Desktop/veritrust`. Every structural claim below is cited to a
file and line, freshly read for this audit. Where I inferred rather than read something, or didn't
check it at all, that's said explicitly. I reused `docs/audits/cost.md` and
`docs/audits/failure-modes.md` as pointers to where to look, and re-verified their claims against
disk rather than restating them from memory; a few numbers below (BullMQ retry count, `s:{sid}:state`
key fan-out) are new detail those two audits didn't cover.

## Nothing new rises to "fix immediately"

I did not find a new urgent defect. The most urgent standing item in the repo is still the one
`docs/audits/failure-modes.md` already flagged: three of `SessionRuntime`'s five timers call Redis
with no try/catch, and an unhandled rejection from any one of them calls `process.exit(1)`
(`backend/src/live/session-runtime.ts:110-118`, `backend/src/index.ts:48-56`), taking down every
other live session on that process. I re-read `session-runtime.ts:108-125` and `sockets/emitter.ts`
and confirm that description still matches the code. Not re-litigated in detail here — see that
audit. Nothing I found below is of that severity; it's schedule risk and maintainability risk, not
an active-incident risk.

## Overall read: this optimizes for feature completion, with real (not cosmetic) stability work only in a few load-bearing places

The system is not "demo code with no engineering discipline." The pipeline orchestration
(`backend/src/pipeline/`), the evidence hash chain, the seal/resume sequence, and the fusion math
itself are all written with real care: idempotent steps, checkpointed resumability, pure functions
with documented invariants, a genuinely candid cross-component architecture doc (see below). But
that care is concentrated in the modules the team clearly treated as "the product" — live scoring,
evidence integrity, the interview lifecycle state machine — and is visibly thinner everywhere else:
provider wiring, cross-service Redis state, and the two things this audit was specifically asked to
weigh (mock-only providers, and the backend/ml split). The honest summary: this was built to prove
the integrity-scoring concept end-to-end, and it succeeds at that narrowly, at the cost of almost
everything adjacent to it being either mocked, unretained, or duplicated.

---

## 1. Mock-only LLM/media providers: real interface, but two different pictures for LLM vs. media

### The LLM side: a genuinely generic interface, plugged in cleanly

`LlmProvider` (`backend/src/providers/llm/llm.provider.ts:37-41`) is three methods —
`parseJd(text, totalMinutes)`, `suggestQuestions(input)`, `gradeAnswer(input)` — all plain
string/JSON in, typed JSON out. Nothing about the interface assumes a particular vendor, streaming,
token budgets, or synchronous/instant response. `MockLlmProvider`
(`backend/src/providers/llm/mock.llm.ts:46-118`) is a deterministic keyword-matcher (regex counts
against a fixed skill table, word-count-based scoring) that implements exactly this interface and
nothing more — no shortcuts leak into the interface shape to accommodate the mock. A real provider
(OpenAI/Anthropic/etc.) could implement `LlmProvider` today without touching the interface.

Where it's less finished than the interface alone suggests:

- **Provider selection is only wired for one of the three env-gated providers.** `env.ts:55-57`
  defines `LLM_PROVIDER`, `MEDIA_PROVIDER`, and `SANDBOX_PROVIDER` as zod enums, but only
  `SANDBOX_PROVIDER` is actually read at the composition root: `getSandbox` branches on
  `env.SANDBOX_PROVIDER === "docker"` (`backend/src/providers/index.ts:35`). `getLlm` and `getMedia`
  ignore their env vars entirely and always construct the mock
  (`providers/index.ts:31,33`: `new MockLlmProvider()`, `new MockMediaProvider()`). Worse, the zod
  enums themselves only accept `"mock"` for both (`env.ts:55-56`) — so even setting
  `LLM_PROVIDER=openai` in `.env` would fail config validation at boot, not just get ignored. This is
  a smaller gap than the `SANDBOX_PROVIDER`/`STORAGE_PROVIDER` situation (those two false-advertise
  slightly less — `SANDBOX_PROVIDER` at least has a real second branch), but it means "swap in a real
  LLM provider" requires editing two files (`env.ts` enum, `providers/index.ts` factory) before a real
  class can even be selected, on top of writing the class.
- **No per-call timeout/retry discipline is uniform across call sites**, and this matters more than
  it looks because the interface makes no promises about latency. `suggestion.service.ts:12-14`
  wraps its one `getLlm()` call in a hand-rolled `withTimeout` (`SUGGESTION_LLM_TIMEOUT_MS`) with a
  question-bank fallback (`suggestion.service.ts:38-43`) — good, deliberate defensive design. But
  `answer-grading.step.ts:23-29` calls `getLlm().gradeAnswer()` in a plain `for` loop over every
  Q&A pair with no timeout and no per-call guard, and `jd-parse.worker.ts:47` calls
  `getLlm().parseJd()` once with no timeout either. Against the mock, both are indistinguishable from
  synchronous, always-succeeding calls, so this was never exercised. Against a real LLM API (rate
  limits, cold starts, occasional 30s+ tail latency) `gradeAnswer`'s loop means a session with N
  Q&A pairs makes N sequential blocking round trips with no timeout on any of them.
  - The blast radius of one slow/failing call is bounded by generic pipeline infrastructure, not by
    anything LLM-aware: `runStep` (`backend/src/pipeline/step-runner.ts:16-39`) catches and records
    any rejection, BullMQ retries the whole `ANSWER_GRADING` job up to 3 times
    (`PIPELINE_JOB_OPTS.attempts = 3`, `backend/src/utils/queues.ts:28`), and `failParentOnFailure:
    false` means a permanently-failing grading step still lets `RenderReport` deliver a degraded
    report (`pipeline/flow.ts:19-23,131-136`). This is real resilience, but it's retry-the-whole-step
    resilience, not LLM-aware resilience: a step that fails on pair 8 of 10 retries all 10 pairs
    (the `upsert` on `qaPairId`, `answer-grading.step.ts:37-60`, makes this safe, but with a real
    metered LLM it means re-paying for 7 already-succeeded calls on every retry).
  - `gradeResultSchema.parse(raw)` (`answer-grading.step.ts:30`) will throw on any malformed/off-spec
    JSON a real model returns; against the mock this path is unreachable since the mock's output is
    constructed to already satisfy the schema. This is caught by the same generic `runStep`/retry
    machinery, not a real-provider-specific validation/repair strategy.
  - By contrast, `jd-parse.worker.ts:44-61` **does** have real per-call error handling — a try/catch
    that records `parseStatus: "FAILED"` and a `parseError` message and publishes an event, rather
    than relying only on the queue's generic retry. This inconsistency (one LLM call site hand-builds
    a timeout, one has real try/catch with a status field, one has neither) is itself a sign the LLM
    integration was built call-site-by-call-site against a mock that never surfaces these gaps, not
    against a shared "how do we call the model" convention.

**What breaks if you swap in a real LLM provider today:** nothing breaks at the interface boundary —
that part is genuinely sound. What's unproven is everything downstream of "the model sometimes takes
9 seconds, sometimes errors, sometimes returns something `gradeResultSchema` rejects, and costs money
per call": `answer-grading.step.ts`'s loop has no batching/parallelism and no timeout, and a real
model's cost/latency profile turns "retry the whole step" from a free safety net into a real cost and
latency multiplier.

### The media side: the interface itself is shaped like one vendor, not generic

`MediaProvider` (`backend/src/providers/media/media.provider.ts:11-18`) is a worse abstraction than
`LlmProvider`. It has a `readonly url` property returned directly to the candidate client
(`join.service.ts:217`: `{ candidateToken, media: { url: getMedia().url, token: mediaToken } }`), a
`createParticipantToken` method, and `startRecording`/`stopRecording` methods that return
`{ egressId, ... }` / `{ compositeKey, hlsKey }`. `MockMediaProvider.url` is hardcoded to
`ws://localhost:7880` (`mock.media.ts:7`) — LiveKit's default local dev server address — and
`compositeKey`/`hlsKey` (`mock.media.ts:21-23`, persisted as `compositeUri`/`hlsUri` on `Recording`,
`backend/prisma/schema.prisma:808-809`) are LiveKit Egress-specific output types (room-composite
recording vs. HLS egress), not a vendor-neutral concept. This interface was written against LiveKit's
shape, not a generic "video session provider" shape. A different real vendor (Daily, Twilio Video,
Agora, a self-hosted SFU with a different recording model) would very plausibly need the interface
itself changed — new fields, different semantics for what "stopRecording" returns — not just a new
class implementing today's `MediaProvider`. This is a materially bigger rewrite risk than the LLM
side, and it's invisible unless you already know what LiveKit's egress API looks like, since the
interface uses generic-sounding names.

- **`verifyCandidateTracks` always returns all-true** (`mock.media.ts:13-15`:
  `{ camera: true, microphone: true, screen: true, screenIsMonitor: true }`), and
  `markMediaReady` (`media.service.ts:6-14`) throws `MEDIA_NOT_READY` when any of those four is
  false. That failure path — a candidate whose camera/mic/screen-share genuinely isn't up — has
  never been exercised against real track-detection logic, because the mock cannot express failure.
  Whatever a real SFU's track-detection latency/flakiness looks like (a moment where a track is
  "connecting" rather than cleanly true/false, for instance) is a state this four-boolean interface
  doesn't even have a slot for today.

**What's unproven if you swap in a real media provider today, concretely:** the actual live
video/audio delivery path to the interviewer dashboard. I confirmed (as `cost.md` also noted) that no
video/audio frames flow through the socket layer (`backend/src/sockets/`); `media.service.ts` only
starts/stops egress. That means the entire "interviewer watches the candidate live" experience — the
core promise of an interview-proctoring product — has no code path in this repo at all beyond a token
handshake and an egress start/stop call. This is a bigger gap than "the media provider is mocked"; it
means the actual video-viewing feature doesn't exist yet in any form, real or mocked, which the mock's
presence somewhat obscures (it makes `POST /consent` and `startSession` succeed, giving the
appearance that media is handled, when the feature it's standing in for was never built past the
token/recording bookkeeping layer). I did not check the frontend's live-interview components for
whether they assume a LiveKit client SDK is already wired there — not checked.

### Bottom line on providers

The LLM boundary is real and swappable with moderate, well-scoped follow-up work (provider selection
wiring, per-call timeout/backoff, batching). The media boundary is not a clean boundary at all — it's
a LiveKit-shaped interface with the actual live-viewing feature unbuilt behind it — and "mock-only"
here means substantially more unproven surface than it does on the LLM side. Treating the two as one
bucket ("LLM/media providers are mocked, ask before productionizing") understates how much more work
the media side needs.

---

## 2. Live scoring (backend) vs. calibration lab (ml/): not a clean split, and the repo already says so

This is the strongest finding in this audit, and unusually, it's mostly the repo's own admission —
I verified it rather than discovering it, but it's worth stating plainly because the task asked
whether this is "a clean separation of concerns... or duplicated logic that can silently diverge,"
and the honest answer is closer to the second, by the project's own documented account.

`docs/cross-component-architecture.md` (read in full) states outright: "`backend/` and `ml/` each
contain a complete, independent implementation of the same integrity-fusion engine... They were not
built as two views of one system; they are two systems that happen to solve the same problem
differently" (lines 9-13). That document is candid and well-written, and I confirmed its comparison
table against both codebases:

| | backend (TypeScript, live, production) | ml (Python, offline lab) |
|---|---|---|
| Channels | 11: `GAZE, FACE, IDENTITY, SCENE, AUDIO, SCREEN, FOCUS, PASTE, RHYTHM, POINTER, ENVIRONMENT` (`backend/src/config/detection.ts:75-87`) | 6: `gaze, scene, focus, input, network, audio` (`contracts/detector-registry.json:34`, `ml/src/vtml/config.py:13-20`) |
| Detector vocabulary | 12 `snake_case` types, `LLR_TABLE` (`detection.ts:15-35`) | 16 `dotted.case` types, `REGISTRY` (`ml/src/vtml/detectors/schema.py:34-58,78-306`) |
| Score formula | `min(100, 200 / (1 + exp(S/σ)))`, `σ ∈ {6,4,3}` by sensitivity, **no LLR clamp** (`fusion.engine.ts:109-112`, `detection.ts:122`) | `100 / (1 + exp(1.6·(S−2.2)))`, **LLR clamped to [-1.0, 4.0]** (`ml/src/vtml/fusion/score.py:34-38`, `config.py:38-39,55-57`) |
| Flag trigger | per-channel accumulator crosses a per-sensitivity threshold, `CHANNEL_THRESHOLDS` 2-5 (`detection.ts:108-120`) | a single observation's boosted LLR crosses one flat `flag_threshold = 0.8` (`config.py:58`) |
| Weights | `CHANNEL_WEIGHTS` per 11 channels, e.g. `IDENTITY: 1.2` (`detection.ts:75-87`) | `channel_weight` per 6 channels, e.g. `AUDIO: 1.25`, `NETWORK: 0.0` by design (`config.py:22-31`) |

Some numeric constants do match exactly between the two — `CORROBORATION_WINDOW_MS = 6000` /
`corroboration_window_ms: int = 6000`, `CORROBORATION_STEP = 0.45` / `corroboration_boost_step:
0.45`, `CORROBORATION_MAX_MULTIPLIER = 2.35` / `corroboration_boost_cap: 2.35`,
`FLAG_MERGE_WINDOW_MS = 15_000` / `merge_window_ms: int = 15000` (`detection.ts:124-128` vs.
`config.py:48-49,61`), and the decay tau for the four channel names both sides share (`GAZE:180,
AUDIO:300, SCENE:240, FOCUS:300` appear in both `CHANNEL_DECAY_SECONDS`, `detection.ts:90-102`, and
`_DECAY_TAU_S`, `config.py:13-20`). This match is clearly the result of one side being hand-copied
from the other at some point — **there is no code or config that enforces it, and no test that would
catch it drifting.** I confirmed this directly: `ml/tests/test_contract.py`'s own docstring says "This
is not a fusion test. It never imports or asserts on LLR values, weights, or scores" (lines 5-9), and
its five test functions (`test_contract.py:34-58`) check only channel-name lists and detector-type/
`wire_channel` pairs against `contracts/detector-registry.json` — never a numeric constant. The
equivalent backend test (`backend/tests/unit/detection-contract.test.ts`, referenced but not read in
full for this audit — I read the ml side and the contract file, which describes both tests
identically) is documented to do the same vocabulary-only check.

`contracts/detector-registry.json` itself is explicit about this being intentional and unresolved: its
own `_readme` says "Neither file imports the other today. This file exists so the two vocabularies are
recorded side by side instead of drifting silently" (lines 9-10), and `typeMapping` "is documentation,
not code — nothing enforces it at runtime yet" (line 21).

**Is there an artifact pipeline (ml produces calibrated weights, backend consumes them)?** No, and the
repo says so directly: `ml/docs/REMAINING_WORK.md` states the fixture-capture-and-fit phase (Phase 3,
which would have produced a `weights.json` with `fitted`/`prior` source tags) "was cut for time before
the hackathon submission" and that "Everything in this codebase currently runs on hand-set prior
weights (`priors.py`), not curves fitted to real behavior. The engine has never scored a real
recording" (lines 15-19). `docs/cross-component-architecture.md:40-45` confirms: ml's designed runtime
entry point (a Lambda handler), its shipped artifact (`weights/weights.json`), and its fitting
pipeline (`calibrate/`) "were all cut and do not exist." So the pattern the task asked me to check for
— "offline calibration feeding into online scoring via some artifact/config" — **does not exist in
this codebase in any form**, not even a stub. `ml/` cannot currently inform `backend/`'s constants even
if someone wanted it to; there is no export path.

**My assessment:** this is not a clean separation of concerns and not (yet) silent duplication either
— it's something in between that the project has been unusually honest about: two independently
authored implementations of the same scoring concept, sharing only a hand-maintained, vocabulary-only
contract, with some numeric constants coincidentally identical (evidently copied once, not kept in
sync) and others already structurally different (channel count, threshold scheme, clamp behavior,
score formula shape). `docs/cross-component-architecture.md:32-35` states the intended direction
plainly: "`ml/src/vtml/` is not a second runtime to migrate to or reconcile scores against — it is the
offline calibration and evaluation lab that is meant to produce and validate the constants a live
scorer consumes... not to run one itself." That is a reasonable target architecture. It is not what
exists today. What exists today is closer to "two hand-authored spec implementations that happen to
agree on a few constants," and the document's own "Open follow-up" section (lines 109-116) confirms
porting ml's numbers into backend "would move backend scores, break the backend's current test
expectations, and require re-pinning ml's locked regression baseline" — i.e., reconciling them is
known to be a real, breaking migration, not a config change, whenever it's attempted.

The risk this creates going forward: nothing currently prevents someone from tuning `detection.ts`'s
weights/thresholds (with the required manual sign-off per `backend/CLAUDE.md`: "ask me before...
changing constants in `src/config/detection.ts`... or the scoring formula") without any signal that
`ml/`'s config has now diverged further, or vice versa, since the contract tests don't look at values
at all. At 100x scale, if `ml/`'s calibration work is ever resumed and its output is wired into
`backend/` (the stated goal), it will hit a genuine impedance mismatch — 6 channels feeding into an
11-channel scoring model, a clamp with no home on the backend side, a per-observation threshold vs. a
per-channel-accumulator one — that will require deciding which model's shape wins, not a data import.

---

## 3. Other hidden technical debt and unscalable shortcuts noticed while reading

- **`s:{sessionId}:state` is an unowned, ad hoc shared Redis hash.** I grepped every construction of
  this key and found it built independently (not through a shared helper) in `sockets/index.ts:164`,
  `lifecycle.service.ts:34,74,80,97,140`, and `media.service.ts:12`, each hand-typing the same field
  names (`"mediaReady"`, `"roomOpen"`, `"telemetrySeen"`) as string literals. There is no module that
  owns this hash's schema — any service or socket handler can read or write any field by guessing the
  literal string correctly. A typo in a field name would silently create a new field rather than
  erroring, and nothing documents the full field list in one place. This is a minor but real
  separation-of-concerns gap: three different layers (services/, live/, sockets/) reach into the same
  piece of shared mutable state directly rather than through an owning module's accessor, which is
  the same pattern `docs/audits/cost.md` already flagged for other per-session Redis keys never being
  cleaned up — this compounds that by also having no single point of ownership for what's inside.
- **Authorization logic is duplicated by hand at least once, with a comment admitting it.**
  `controllers/link.controller.ts:13-23`'s `listLinks` inlines a `canWrite` check
  (`role === "OWNER" || role === "ADMIN" || (session-interviewer lookup)`) with the comment "Same
  rule as `requireSessionAccess({ write: true })`" — i.e., the same access rule exists as reusable
  middleware/service logic elsewhere, and this one call site reimplements it inline instead of calling
  it, because it needs the boolean rather than a throw/pass gate. Low risk today (it's a read-only
  list, and the logic is short and correct as written), but it's exactly the kind of duplicated
  authorization check that silently drifts if `requireSessionAccess`'s rule ever changes and this
  inline copy isn't updated alongside it.
- **Controllers are otherwise genuinely thin**, which is worth stating since it's a real strength, not
  a gap: every controller I sampled (`session.controller.ts`, 154 lines, the largest;
  `coding-task.controller.ts`, `jd.controller.ts`, etc.) is pure `getInput → service call → respond`
  with no business logic, and only `link.controller.ts` touches `prisma` directly, for the reason
  above. This is a consistent, well-held convention across ~1,000 lines of controllers — the
  route/controller layer is not where this codebase's debt lives.
- **`registry.ts`'s in-memory `Map<string, SessionRuntime>`** (`backend/src/live/registry.ts:4`) is
  the single source of truth for "which process owns this live session," and it's local to one Node
  process with no persistence or cross-process visibility. `docs/audits/cost.md` and
  `docs/audits/failure-modes.md` already cover the consequences (no horizontal scaling without
  session affinity, the zombie-runtime race) in depth; I re-read `registry.ts` and confirm it's
  exactly as described — a plain `Map`, `get`/`set`/`delete`, no locking, no cross-instance
  reconciliation. Not re-analyzed further here to avoid duplicating that work.
- **No metrics/APM anywhere in `backend/`** — confirmed by grep (no `prom-client`, `sentry`,
  `opentelemetry`, `datadog`, `statsd` in `backend/package.json` or `backend/src`), consistent with
  `docs/audits/failure-modes.md`'s finding. At 100x scale, every silent-drop path this audit and the
  prior two describe (dropped Postgres writes in `enqueue()`, `getLlr()`'s unknown-type counter that
  "nothing downstream reads" per its own comment at `detection.ts:49-50`, the `s:{sid}:state` hash
  above) is invisible until someone goes looking, because there is no dashboard or alert surface at
  all, only structured logs.
- **`STORAGE_PROVIDER`, `LLM_PROVIDER`, `MEDIA_PROVIDER` are all zod enums with exactly one legal
  value** (`env.ts:45,55-56`, cost.md already covered `STORAGE_PROVIDER`), which means the
  configuration surface advertises a pluggability that config validation itself forecloses today.
  This is a small thing but it's a pattern: three separate "provider" abstractions were designed to
  look swappable and are currently wired to accept only the placeholder.

## Not checked

- `backend/tests/unit/detection-contract.test.ts` itself — I read its Python counterpart
  (`ml/tests/test_contract.py`) in full and the shared `contracts/detector-registry.json`, and I'm
  relying on the contract file's own description (and `docs/cross-component-architecture.md`'s
  claim) that the TypeScript test does the equivalent vocabulary-only check, rather than reading that
  test file directly.
  - There is no shared code path between ml calibration output and backend config to inspect, since
    Phase 3 (the fitting pipeline) was cut — confirmed via `ml/docs/REMAINING_WORK.md`, not by
    searching for an artifact file that doesn't exist.
- The frontend (`frontend/`) — not reviewed at all for this audit. In particular, whether the
  live-interview UI already assumes a specific media SDK (LiveKit's client library or otherwise) that
  would further constrain or ease a real `MediaProvider` swap was not checked.
- `ml/src/vtml/evaluate/`, `ml/src/vtml/detectors/offline_video.py`, and the rest of ml's
  evaluation/figures tooling — read only enough (`priors.py`, `config.py`, `fusion/score.py`,
  `fusion/channel.py`, `detectors/schema.py`) to compare against the backend's live scorer; the
  broader eval harness (metrics, report generation, ablation sweeps) was not read.
- `backend/src/live/detectors/*.ts` (the actual TS detector implementations that emit LLR-scored
  observations) were not read line-by-line; only `config/detection.ts` (the LLR/weight tables they
  feed into) and `fusion/fusion.engine.ts` (the pure scoring functions) were read closely.
- Did not run either test suite (`npm test` in `backend/`, `pytest` in `ml/`) to confirm the contract
  tests currently pass — read-only static audit, no commands executed beyond `grep`/`find`/reads.
- Did not check `frontend/lib/live/` or `components/live-interview/` for how the dashboard would
  behave if a real `MediaProvider`'s `verifyCandidateTracks` ever returned a false value, since the
  mock never has.
