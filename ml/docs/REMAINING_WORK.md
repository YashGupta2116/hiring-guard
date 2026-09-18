# VeriTrust ML (veritrust-ml) — What's Left

**As of:** 2026-09-18. Per `docs/Phases.md`, Phase 6 was the last phase and it's done — all 5
non-cut phases (0, 1, 2, 4, 6) are complete, 89 tests passing, `mypy --strict` clean. This file is
the "what to pick up next" list; the full paper trail is in `docs/Memory.md` (Key decisions, Known
issues, Do not redo).

**Important context this component's own docs already state clearly:** this is an **offline
calibration/evaluation lab**, not the live scorer. `backend/` runs its own independent TypeScript
fusion engine in production and does not import or call anything here — see
[`../../docs/cross-component-architecture.md`](../../docs/cross-component-architecture.md). Nothing
below implies wiring this component into the live product; that was a deliberate decision, not a gap.

---

## 1. The two cut phases — the big remaining work

Two of the seven originally-planned phases were **cut for time before the hackathon submission**, not
completed with a shortcut. Both are fully specified in `docs/Phases.md` and ready to execute:

### Phase 3 — Fixture capture and calibration fit (cut)
Everything in this codebase currently runs on **hand-set prior weights** (`priors.py`), not curves
fitted to real behavior. The engine has never scored a real recording.

- **What it needs:** 20 real recorded sessions (10 honest, 10 staged) captured via a small
  MediaPipe-Tasks + DOM-listener + Monaco-bridge browser harness (not built yet — `calibrate/`
  doesn't exist), 3–5 minutes each, varying lighting/camera/glasses/background so the model doesn't
  learn "bad webcam = cheating." Staged sessions need a written script with exact timestamps as
  ground truth (phone in frame at 1:10, off-screen 40s at 2:05, paste at 3:20, etc.).
- **What gets built:** `calibrate/dataset.py` (joins observations to labels by time overlap),
  `calibrate/fit.py` (per-detector logistic fit → LLR → clamp → `weights.json` with a `fitted`/`prior`
  source tag per detector).
- **Exit bar** (already written in `Phases.md`): 20 fixtures + labels under 10MB total, every detector
  with ≥15 positives is `fitted` (rest stay `prior`, and the report says which), no fitted curve
  produces an out-of-clamp LLR before clamping (reject the fit outright if one does, don't silently
  clip), a held-out honest session scores above 85.
- **Why it matters:** without this, every number this component reports is honest about being
  *unvalidated against real behavior* — it's a designed-and-specified pipeline with nothing fitted
  yet. Flag precision/recall and population-median targets from PRD §7 are literally not computable
  until this runs.

### Phase 5 — Lambda packaging and latency (cut)
The engine "has never run anywhere but a laptop." No packaging, no deployment target, no measured
cold-start/warm latency in a real serverless environment — only the synthetic-stream batch-latency
number in Measured Numbers (p50 0.17ms / p95 0.27ms, which is *engine compute time*, not
network/cold-start). Revisit once there's an actual place this needs to run.

---

## 2. Owed process work (do this before anything else ships)

- **Codex review is owed on four phases' diffs** (Phase 1, Phase 2, Phase 4, Phase 6) — this is a
  standing project instruction ("send every implementation's diff to Codex for review before calling
  it done") that was explicitly skipped by user decision this session, in direct conflict with that
  standing instruction. **Action:** send the combined Phase 1 + 2 + 4 + 6 diff to Codex for review
  before treating any of that work as fully signed off, per the project's own rules.

## 3. Real, specific gaps (not cut phases, just unbuilt)

- **No golden regression fixture set.** `Rules.md` §8 names three golden fixtures
  (`honest_clean`, `honest_noisy_camera`, `staged_phone_and_glance`) and a
  `tests/test_replay_golden.py` to check them — none of this exists. Every phase's numbers currently
  rest on exactly two synthetic fixtures (`honest_seed7`/`staged_seed7`) plus the demo fixture, not a
  broader regression set. **Action:** build the three golden fixtures and the golden test before
  trusting the eval numbers as representative of more than "the two seeds we happened to generate."
- **Generic per-channel unscored-window rendering is incomplete.** Design.md §5's Track 2 spec
  ("sand/400 hatched blocks spanning the full row height") is only implemented for the fixed
  calibration span — an arbitrary `suppress()`/`resume()` window (e.g. the demo fixture's own
  3:15–3:45 gaze suppression) is real in the engine (`SessionResult.unscored`, tested) but doesn't
  draw a hatch block on the figure. Not required by any phase's exit criteria so far; build it once a
  fixture actually needs to show it.
- **`Engine.to_state()`/`from_state()` don't round-trip baseline/calibration/rhythm-window state.**
  State-serialization round-tripping was a named Phase 5 exit criterion (now cut); no test exercises
  it. A `from_state()` reconstruction mid-calibration-window would currently restart calibration from
  scratch. Worth fixing whenever Phase 5-equivalent packaging work resumes, since a real deployment
  would need to serialize/resume engine state across invocations.
- **`offline_video.py` uses a fixed 20° yaw threshold and a fixed 5s glance/persistent split**, not
  the candidate's own baseline — there's no baseline at offline-capture time by design (baselines are
  built live, per-session). This is a known, intentional stand-in for turning a video clip into
  discrete gaze/scene events; revisit if offline video capture becomes a first-class real input path
  rather than a fixture-generation helper.
- **No real MediaPipe `.task` model file is bundled or downloaded.** `FaceReader` is a
  caller-supplied protocol (frame in, pose/face-count out) specifically so this stays true without
  making a network call from a test/build — wiring an actual `FaceLandmarker`/`FaceDetector` with a
  real model path is left to whoever integrates a real video input.

## 4. Known, intentional inconsistencies (not bugs — don't "fix" these without a reason)

- **`Engine.ingest`'s `reordered` count vs. `ingest.py::normalise()`'s definition intentionally
  disagree.** `Engine.ingest` still uses the original Phase 1 definition (pinned by
  `test_regression_baseline.py`); the newer `ingest.py::normalise()` (not called by `Engine.ingest`)
  uses a proper watermark-based definition with a separate `late_beyond_buffer` flag. See
  `ingest.py`'s own docstring before touching either.
- **`Flag.score_delta` values don't sum to the session's total score drop**, and nothing in the
  engine's output says so. This is mathematically correct (each delta is an honest leave-one-out
  measurement, and the sigmoid-over-weighted-sum scoring function is non-additive by construction,
  verified by `test_ethics.py` rule 3) — the risk is purely in how a UI presents multiple deltas next
  to one gauge number. The fix, if any is needed, is a UI label ("dismissing this recovers N points,"
  never "this cost N points") or a one-sentence methodology-appendix note — **not** a change to this
  engine.
- **`Flag.media_offset_ms` is just the triggering observation's `t_ms`.** There's no separate media
  clock concept in this component (no video pipeline of its own) — this is the simplest value that
  satisfies the field, not a placeholder waiting to be replaced by this component.

## 5. What's genuinely done and doesn't need revisiting

The fusion core (decay, corroboration, score, flags, ethics rules 1–7 all tested), the 16-detector
registry across 6 channels, personalized baselines (gaze/rhythm), the full evaluation harness (4
figures + metrics + report generator), the demo replay + walkthrough, and the cross-component
contract test against `backend/`'s detector vocabulary are all built, tested (89 passing), and
type-clean (`mypy --strict`). None of that is "remaining work" — only the two cut phases and the
smaller items above are.
