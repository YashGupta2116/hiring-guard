# VeriTrust ML (veritrust-ml) — What's Left

**As of:** 2026-09-20. Phases 0, 1, 2, 4 and 6 are complete; Phase 3 is partial (its pipeline is
built, its recorded fixtures are not captured); Phase 5 is still cut. 162 tests passing, `mypy`
clean. This file is the "what to pick up next" list; the full paper trail is in `docs/Memory.md`
(Key decisions, Known issues, Do not redo).

**Important context:** this is an **offline calibration/evaluation lab**, not the live scorer.
`backend/` runs its own independent TypeScript fusion engine in production. As of 2026-09-20 it does
*consume this component's output* — `backend/src/config/calibrated-weights.ts` reads
`weights/weights.json` and adopts the fitted magnitudes into its own LLR table, behind a flag that
is off by default — but it still does not import or call anything here, and there is no network
integration between the two. See
[`../../docs/cross-component-architecture.md`](../../docs/cross-component-architecture.md), "The
artifact seam". Nothing below implies making this component a second live runtime; that remains a
deliberate decision, not a gap.

---

## 1. The two cut phases — what is left of them

Two of the seven originally-planned phases were **cut for time before the hackathon submission**, not
completed with a shortcut. Both are fully specified in `docs/Phases.md`. Phase 3's code half was
built on 2026-09-20 and only its recording half is outstanding; Phase 5 is untouched.

### Phase 3 — Fixture capture (the pipeline is built; the recordings are not)

**Built 2026-09-20.** `calibrate/dataset.py`, `calibrate/fit.py`, the artifact (`weights.py`,
`weights/weights.json`, `weights/weights.schema.json`), the engine path that reads a fitted curve,
and 37 tests over all of it. Four of sixteen detectors are fitted; the other twelve carry their
prior and a recorded reason.

**Still needed, and it needs people, not code:** 20 real recorded sessions (10 honest, 10 staged),
3–5 minutes each, varying lighting/camera/glasses/background so the model doesn't learn "bad webcam
= cheating", captured through a small MediaPipe-Tasks + DOM-listener + Monaco-bridge browser harness
(`calibrate/` has no capture page — that was task 1 and is not built). Staged sessions need a written
script with exact timestamps as ground truth (phone in frame at 1:10, off-screen 40s at 2:05, paste
at 3:20). `Rules.md` §1 forbids fabricating a labelled recording, so the shipped curves are fitted on
sessions from the synthetic generator instead.

**What that means for every number here.** The artifact records `dataset.kind: "synthetic"`, the
backend logs it at startup, and the eval report says it. A curve fitted on generated fixtures
validates the *pipeline*, not the behaviour: it is not evidence about real candidates, and flag
precision/recall and the population-median targets from PRD §7 are still not computable. Do not
present a synthetic fit as a measured result.

**Two exit criteria remain unmet** and cannot be met without the recordings: "20 fixtures and 20
label files in the repo" and "a held-out honest session scores above 85" against real data (it holds
against generated data — both honest goldens stay clear with the fitted artifact).

**One was changed, with approval:** the out-of-clamp rejection now applies to `llr_clamp_max` only,
not `llr_clamp_min`. An LLR is centred at zero while the clamp is `[-1.0, 4.0]`, centred at +1.5, so
the floor tripped on any detector that discriminated at all. Reasoning in `Memory.md`, 2026-09-20.

**Next step when the recordings exist:** drop them in `fixtures/recorded/` with their label files and
run `python -m vtml.calibrate.fit --fixtures fixtures/recorded --version <v> --dataset-kind recorded`.
Nothing else needs writing.

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

- **Golden regression fixtures — done 2026-09-20.** `fixtures/golden/` holds all three named in
  `Rules.md` §8, each with a committed expected `SessionResult`, checked by
  `tests/test_replay_golden.py`. One caveat worth carrying: `honest_noisy_camera` clears the >85 bar
  at 89.29, but the margin depends on how bad "a bad webcam" is taken to be and the bar breaks at 7
  sub-second dropouts per 5 minutes (sensitivity table in `Memory.md`). If a real recording is
  noisier than that, the fix is a scene-channel change, not a gentler fixture. **Still open:**
  `evaluate/` reads the seed-7 pair, not the goldens — wiring the eval harness to the golden set is a
  small follow-up nobody has done.
- **Generic per-channel unscored-window rendering is incomplete.** Design.md §5's Track 2 spec
  ("sand/400 hatched blocks spanning the full row height") is only implemented for the fixed
  calibration span — an arbitrary `suppress()`/`resume()` window (e.g. the demo fixture's own
  3:15–3:45 gaze suppression) is real in the engine (`SessionResult.unscored`, tested) but doesn't
  draw a hatch block on the figure. Not required by any phase's exit criteria so far; build it once a
  fixture actually needs to show it.
- **`Engine.to_state()`/`from_state()` round-trip — done 2026-09-20.** They now carry the baseline,
  the rhythm window and, until the baseline closes, the `BaselineBuilder`'s gathered samples, covered
  by `tests/test_state_roundtrip.py`. Once the baseline closes, `to_state()` writes
  `baseline_builder: null`, because nothing reads the samples after that. `from_state()` still loads a
  payload that carries them and ignores them. The gap was not theoretical: a candidate sitting ~20
  degrees to their camera lost 3.839 points and gained a spurious flag purely for crossing a
  serialisation boundary, because the resumed engine fell back to the population neutral pose. A state
  dict written without the new keys still loads.
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

---

## 6. Opened by the 2026-09-20 session

- **The `[-1.0, 4.0]` clamp is asymmetric on purpose.** The two ends fail differently. Clipping at
  the ceiling hides a fit that wanted to dominate the score. Clipping at the floor only makes
  clean-behaviour evidence less exculpatory than the fit asked for, and the clipped value stays at or
  below zero, so it cannot manufacture a false positive. Each end is set by the error it can cause.
  The ceiling is 4x the floor's magnitude, which is why a centred LLR trips the floor and never the
  ceiling. This entry is the record of that reasoning: `Rules.md` §5 lists the two values and
  nothing else, and neither value changed.
- **`evaluate/` still reads the seed-7 pair, not the golden set**, and does not know about
  `weights/weights.json` — the report title still says `eval-phase1-priors.md`. Running the harness
  against the goldens with the fitted artifact would produce the first before/after any reader could
  compare, and is maybe an hour's work.
- **A fitted curve is still only consumed as a magnitude by `backend/`.** Backend detectors compute a
  `strength` in 0..1 and discard it; `ml/`'s curve is a function of confidence. Feeding one into the
  other needs the two quantities reconciled first (backend `strength` is a normalised magnitude,
  `insertedChars / 2000`, not a probabilistic confidence). Until then the backend adopts only the
  curve's value at its operating point. This is the single largest piece of value left on the table
  from calibration.
- **Codex review is owed on this session's diff too**, on top of the four phases already listed in
  section 2. It is also owed on the later post-calibration cleanup diff (Dockerfile packaging, the
  fail-loud flag, the `scaleBySensitivity` guard and the `to_state` change). Codex is rate-limited until
  29 Sep, so that diff had a ponytail review instead.
