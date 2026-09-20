# Phases: VeriTrust Integrity Engine

Component: `veritrust-ml`

Seven phases were planned. Two are cut. Each remaining one is independently testable and leaves the repo in a working state. Do not start a phase before the previous one's exit criteria all pass.

**The demo video records the evening of 19 September, not the 20th.** Everything below is scheduled against that, not against the submission deadline.

| Phase | What lands | Status |
|---|---|---|
| 0 | Scaffold, types, config, synthetic generator | Done |
| 1 | Fusion core and its tests | Done |
| 2 | Detector registry, ingest, baselines | Done |
| 3 | Fixture capture and calibration fit | **Cut.** Needs three people in front of webcams and there is no time left to schedule it. Phase 4 runs on synthetic fixtures with prior weights, and the demo says so out loud |
| 4 | Evaluation harness and report | Done |
| 5 | Lambda packaging and latency | **Cut.** The video cannot show where the engine ran, so this buys nothing before submission. Revisit after |
| 6 | Demo fixture and the story it tells | Done |

Also landed outside the phase plan: `Engine.snapshot(t_ms)`, a non-destructive mid-session read. The demo's opening beat and the F4 timeline both need the score sampled without ending the session.

Also landed outside the phase plan, after Phase 6 (2026-09-18): a prior-sensitivity sweep and a calibration-window ablation, answering whether the hand-set priors' exact values matter and what the calibration-window fix was actually worth. `evaluate/priors_sweep.py`, `evaluate/calibration_ablation.py`, figure F5, and `docs/reports/prior-sensitivity-18sep.md`. See `docs/Memory.md` for the numbers.

What the Phase 3 cut costs: the claim that the numbers came from recorded behaviour. State that in the video rather than letting a judge notice it. The calibration pipeline is designed and specified, it just has no recordings to fit on yet, and that is a more honest position than a quiet gap.

---

## Phase 0: Scaffold

**Goal.** A repo that installs, imports and runs an empty test suite.

**Tasks**
1. `pyproject.toml` with runtime deps `pydantic`, `numpy` and a `dev` extra holding the rest. Package layout `src/vtml/`.
2. `types.py`: `Channel`, `Severity`, `Source` enums; `Observation`, `Flag`, `UnscoredWindow`, `SessionResult`, `IngestResult`. `features` typed `dict[str, float]` with a validator that rejects anything else.
3. `config.py`: `EngineConfig` carrying every constant from Rules section 5, with the three sensitivity presets.
4. `priors.py`: hand-set LLR priors for all detector types, each with a one-line comment giving the reasoning.
5. `fixtures/synthetic/generate.py`: emits observation streams from a scripted event list. Honest sessions get low-confidence background noise. Staged sessions get scripted events at known times. Seeded.
6. `docs/Memory.md` created from the template at the end of this file.

**Exit criteria**
- `pip install -e ".[dev]"` succeeds
- `pytest` runs and collects zero failures
- `python -m vtml.fixtures.synthetic.generate --profile honest --seed 7` writes a valid JSONL that round-trips through `Observation`
- `Memory.md` exists and records Phase 0 complete

---

## Phase 1: Fusion core

**Goal.** The engine produces scores and flags from an observation stream. This is the phase that matters most, and it needs no data, no browser and no cloud.

**Tasks**
1. `fusion/channel.py`: `ChannelState` with `llr`, `last_update`, a 60 s ring buffer of recent evidence, `suppressed`. Methods `decay_to(t)` and `add(evidence)`.
2. `fusion/corroborate.py`: given recent evidence across channels and an incoming item, return the boost and the corroborating channel list. Same-channel repeats damp at 0.6 instead of boosting.
3. `fusion/score.py`: weighted sum, sigmoid, band mapping, finite-value guard.
4. `fusion/flags.py`: threshold check, severity cut, `score_delta` by leave-one-out recomputation, merge within 15 s, severity raised one tier when two or more channels corroborate.
5. `fusion/narrate.py`: one template per detector type. Templates state the observation, the duration and the corroborating channels. The banned-word list from Rules section 6 is asserted in test.
6. `fusion/windows.py`: open, close, and the suppression rule that stops both accumulation and decay.
7. `fusion/engine.py`: `Engine` with `ingest`, `suppress`, `resume`, `recompute`, `finalise`, `to_state`, `from_state`.
8. Tests: `test_fusion_math.py`, `test_corroboration.py`, `test_flags.py`, `test_windows.py`, `test_ethics.py`, `test_determinism.py`.

**Exit criteria**
- Every constant in Rules section 5 is read from config, and a grep for a bare float literal in `fusion/` returns nothing but 0.0, 1.0 and 2.0
- Hand-computed unit tests pass for: a single observation's LLR, a decayed accumulator after 90 s, a two-channel corroboration boost, a merged flag's extended span
- All seven ethics tests pass
- Same input plus same seed produces byte-identical `SessionResult` across 10 runs
- A synthetic staged session emits at least one medium flag; a synthetic honest session emits no high flag

---

## Phase 2: Detectors, ingest and baselines

**Goal.** Real observation shapes, clock correction, and per-candidate baselining.

**Tasks**
1. `detectors/schema.py`: the registry. One row per detector type carrying channel, whether it is interval-based, the feature keys it emits, and its prior. Everything else reads this registry rather than hardcoding type strings.
2. `ingest.py`: validate, clock-correct, dedupe by `(source, seq)`, 2 s reorder buffer, drop-and-count on invalid.
3. `baseline.py`: `BaselineBuilder` collecting gaze home region (convex hull of gaze points), head pose median, keystroke interval distribution, baseline glance rate. `finalise()` returns the baseline or population defaults with `fallback` set.
4. Wire personalised thresholds: gaze offscreen yaw threshold shifts with the baseline neutral pose; rhythm anomaly runs a two-sample KS test against the baseline distribution.
5. `detectors/offline_video.py`: MediaPipe Python over an mp4, emitting the same `Observation` shapes as the browser will.

Also landed this phase but never named in the task list above: `wire.py`, mapping engine channels and
detector types to the backend's `MonitoringChannel` enum at the serialisation boundary (`Memory.md`
already credits it under this phase's "Done" line; this file didn't). Tested in `tests/test_wire.py`.

**Exit criteria**
- A 60 s synthetic stream produces a complete baseline; a 20 s stream produces `fallback`
- Out-of-order observations inside 2 s are reordered; beyond 2 s they are accepted with a counted warning
- A duplicate `(source, seq)` is dropped and counted
- `offline_video.py` processes a 30 s test clip and emits valid observations
- Personalised threshold test: the same gaze stream against two different baselines produces different flag counts

---

## Phase 3: Fixture capture and calibration -- PARTIAL (2026-09-20)

**Originally cut before submission** because it needs three people in front of webcams for 20
sessions. Tasks 5 and 6 -- the pipeline -- were built on 2026-09-20 and run end to end; tasks 1 to 4
still need people and are the only thing left.

**Built:** `calibrate/dataset.py` (task 5), `calibrate/fit.py` (task 6), the artifact itself
(`weights.py`, `weights/weights.json`, `weights/weights.schema.json` generated from the Pydantic
model so it cannot drift), and the engine path that reads a fitted curve
(`Weights.from_file()`; `Weights()` still scores off `priors.py`, which is what keeps the locked
regression baseline and the goldens pinned). `backend/` consumes the artifact -- see
`../../docs/cross-component-architecture.md`, "The artifact seam".

**Not built:** tasks 1 to 4. No browser capture harness, no recorded sessions, no human-written
label scripts. `Rules.md` section 1 forbids fabricating a labelled recording, so the fit runs on
sessions from the synthetic generator instead (a new `staged_calibration` profile with jittered
confidences and detector misfires, since the regression fixtures pin one fixed confidence per event
type and a curve over a single x is unidentifiable). The artifact records this as
`dataset.kind: "synthetic"` and every consumer surfaces it. **A curve fitted on generated fixtures
is not evidence about real behaviour**, and no number from it should be presented as if it were.

**Exit criteria, as actually met:** 4 of 16 detectors fitted, 12 on priors with a recorded reason
each; `weights.json` validates against its schema; no accepted curve exceeds the clamp ceiling. Two
criteria are not met and cannot be without tasks 1 to 4: there are no 20 recorded fixtures, and
"a held-out honest session scores above 85" is only checkable against generated data (where it
holds: both honest goldens stay in the clear band with the fitted artifact).

**One criterion was changed, with approval.** "No fitted curve produces an LLR outside the clamp
before clamping" now applies to the ceiling (`llr_clamp_max`) only. An LLR is centred at zero by
construction while the clamp is `[-1.0, 4.0]`, centred at +1.5, so the floor trips as soon as a
detector discriminates at all and the rule as written admitted only detectors that barely work.
Full reasoning in `Memory.md`'s Key decisions, 2026-09-20.

**Goal.** Fitted curves from real recordings. This is the only phase with a hard external dependency, which is me and two teammates sitting in front of a webcam.

**Tasks**
1. Browser capture harness: a single page running MediaPipe Tasks, the DOM listeners and the Monaco bridge, writing observations to a downloadable JSONL. No backend.
2. Record 20 sessions of 3 to 5 minutes. Ten honest, ten staged. Vary lighting, camera quality, glasses, and background across both groups, so the model does not learn "bad webcam means cheating".
3. Staged sessions follow a written script with timestamps: phone in frame at 1:10, look off-screen for 40 s at 2:05, paste a block at 3:20, and so on. The script is the ground truth.
4. `labels/<session>.json` written from the scripts. Honest sessions get an empty event list.
5. `calibrate/dataset.py`: join observations to labels by time overlap, emit the fitting table.
6. `calibrate/fit.py`: per-detector logistic fit, convert to LLR, clamp, write `weights.json` with a version string and a per-detector `source` of `fitted` or `prior`.

**Exit criteria**
- 20 fixtures and 20 label files in the repo, total under 10 MB (observations only, no video committed)
- `weights.json` validates against `weights.schema.json`
- Every detector with 15 or more positives is `fitted`; the rest are `prior` and the report says which
- No fitted curve produces an LLR outside the clamp before clamping, and if one does, the fit is rejected with a clear error rather than silently clipped
- A held-out honest session scores above 85 with the fitted weights

**Risk.** If recording slips, Phase 4 runs on synthetic fixtures with prior weights and the demo says so. The engine works either way. What is lost is the claim that the numbers came from real behaviour, so protect this phase's time.

---

## Phase 4: Evaluation

**Goal.** Numbers I can put on a slide, produced by a command rather than by hand.

**Tasks**
1. `evaluate/metrics.py`: flag precision and recall against labels with a 5 s matching tolerance; score separation between honest and staged; per-channel contribution breakdown; latency distribution.
2. `evaluate/figures.py`: four figures, styled per `Design.md`. Score distribution by session type. Reliability curve per detector. Sensitivity sweep across the three presets. A timeline of one staged session showing observations, flags and the score together.
3. `evaluate/report.py`: writes `reports/eval-<weights_version>.md` with every metric, every figure, the honest-session false-positive count called out at the top, and the list of detectors still on priors.
4. Run the sweep. If a target from PRD section 7 is missed, adjust **one** thing: the channel weight for the channel driving the miss. Record the before and after in the report. Do not tune six constants at once.

**Exit criteria**

Restated against synthetic fixtures and prior weights, since Phase 3 is cut. The original wording assumed 20 recorded sessions and fitted curves, neither of which exists.

- `python -m vtml.evaluate` produces the report and figures end to end, reading the synthetic fixtures and `priors.py`
- Zero high-severity flags on the honest fixture
- The honest fixture scores in the clear band and the staged fixture in the suppressed band, with the separation visible on F1 without reading an axis
- F4, the session timeline, renders from `snapshot()` samples across a staged session and shows the score arc, the evidence ticks and the flags on one x axis
- Every figure is readable in greyscale
- The report's summary block states that every detector is on a prior and no curve is fitted. That line is not buried

Flag precision, recall and median-score targets from PRD section 7 are not checkable without labelled recordings. The report says so rather than computing a number against a single staged fixture and presenting it as a rate.

**Done, 2026-09-18.** All exit criteria above pass; see `docs/Memory.md` for the numbers, the F2 hatched-grid decision, the font substitution, and the batch-latency stream. What Phase 6 inherits: F4's `_build_timeline()` in `evaluate/figures.py` already knows how to interleave `ingest()` and `snapshot()` calls and read back real evidence ticks -- Phase 6's replay command and demo walkthrough can reuse that pattern rather than re-deriving it. Dismissed-flag styling on F4 (Design.md section 5) is still unbuilt, since nothing was dismissed this phase; Phase 6's minute-9 dismissal is the first real case to build and check it against.

---

## Phase 5: Lambda packaging -- CUT

**Not running before submission.** The video cannot show where the engine ran, so packaging buys nothing this week. The section below stays as the specification for after.

One piece of it is worth keeping in reach regardless: `tests/test_runtime_deps.py` from Rules section 3 is the test that keeps `sklearn`, `pandas`, `matplotlib`, `cv2` and `mediapipe` out of the runtime path. Phase 4 adds matplotlib to `evaluate/`, which is exactly the kind of import that leaks. If Phase 4 finishes with time to spare, write that test before anything else here.

**Goal.** The same engine runs in AWS with a bundle that fits and a cold start that does not embarrass the demo.

**Tasks**
1. `handler.py`: parse the WebSocket event, load state from DynamoDB, `Engine.from_state`, ingest, persist with a conditional write on `state_version`, return the new flags and score.
2. State serialisation round-trip test: `from_state(to_state(engine))` produces an engine that scores identically on the next batch. Once the baseline has closed, `to_state` writes `baseline_builder: null` because nothing reads those samples again, and `from_state` still loads a payload that carries them.
3. Build the zip with runtime deps only. Assert size and assert the dev libraries are absent.
4. `tests/test_runtime_deps.py` from Rules section 3.
5. Measure cold start and per-batch latency. Record both in `Memory.md`.

**Exit criteria**
- Bundle under 50 MB, and `sklearn`, `pandas`, `matplotlib`, `cv2`, `mediapipe` absent from it
- Round-trip test passes
- p95 batch latency under 50 ms, cold start under 800 ms
- `Engine.recompute` for adjudication returns in under 10 ms

---

## Phase 6: The demo session

**Goal.** One fixture that tells the story in 90 seconds, replayable on demand, identical every time.

**Tasks**
1. Build `fixtures/demo_session.jsonl` as a staged session with a deliberate arc:
   - minute 1, calibration, score reads `calibrating`. `Engine.snapshot(t_ms)` is what reads this without ending the session, and it returns `status="calibrating"`, `score=None`, `band="calibrating"` inside the window
   - minute 3, a single gaze glance, accumulates, no flag. **This is the point of the demo.** One ambiguous signal is not evidence
   - minute 7, gaze plus scene agree inside the window, corroboration boost, medium flag, score visibly drops, candidate warning fires
   - minute 9, the reviewer dismisses it, score recovers exactly, and the dismissal is recorded for calibration
   - minute 12, camera drops for 30 s, an unscored window opens, the score does not move
2. A replay command that streams it in real time or at 10x for the recording.
3. A one-page `reports/demo-walkthrough.md` mapping each beat to the spec section it implements, so the video narration writes itself.

**Exit criteria**
- The replay produces the same five beats every run
- The score arc is legible on a chart without narration
- The walkthrough page fits on one page

**Done, 2026-09-18.** Compressed to roughly 4 minutes per this session's handoff, not the 12 minutes above -- the beats matter, not the wall-clock spacing (a 12-minute session at 10x is two minutes of replay, most of a video's budget spent watching a line move). Actual schedule: 0:00-1:00 calibration; 1:30 glance, no flag; 2:15/2:18 a corroborating gaze event and a scene event, medium flag corroborated by gaze, score 96.52 -> 34.40; 2:45 dismissal, score -> 90.83, exact; 3:15-3:45 signal loss on gaze, score unchanged at 93.25 on both sides; 4:00 session end. `fixtures/demo_session.jsonl` plus `.labels.json`, `src/vtml/replay.py` (`python -m vtml.replay --speed 0|1|10`), `reports/demo_timeline.png`/`.svg` (F4's dismissed-flag styling, unbuilt since Phase 4, is built and checked against a real dismissal here for the first time), and `reports/demo-walkthrough.md` all exist. All three exit criteria above pass; see `docs/Memory.md` for the full numbers and every decision along the way.

**What remains undone overall, now that this is the last phase:**
- Phase 3 (fixture capture, calibration fit) and Phase 5 (Lambda packaging) are cut, not done -- see their sections above. The engine has never scored a real recording and has never run anywhere but a laptop.
- Codex review is owed on the Phase 1 + Phase 2 + Phase 4 + Phase 6 diff (`docs/Memory.md`, Known issues) -- skipped this session by explicit user decision, not completed.
- `tests/test_replay_golden.py` and the three named golden fixtures (Rules.md section 8: `honest_clean`, `honest_noisy_camera`, `staged_phone_and_glance`) still do not exist. Every phase's numbers rest on the two `_seed7` synthetic fixtures plus the demo fixture, not a broader regression set.
- Generic per-channel unscored-window rendering on F4's Track 2 (Design.md section 5) is still unbuilt for anything other than the fixed calibration span (`docs/Memory.md`, Known issues) -- the demo's own 3:15-3:45 gaze suppression doesn't draw a hatch block there.

---

## Memory.md template

Create this in Phase 0 and update it at the end of every work session, not just every phase.

```markdown
# Memory

## Current state
Phase: <n>, <name>
Last session: <date>
Next action: <the single next task>

## Done
- [x] Phase 0: scaffold, types, config, synthetic generator
- [ ] Phase 1: fusion core

## Key decisions
| Date | Decision | Reason |
|---|---|---|
| | | |

## Measured numbers
| Metric | Value | Where measured |
|---|---|---|
| | | |

## Known issues
- <issue, and whether it blocks the current phase>

## Do not redo
- <things already tried that failed, so the next session does not repeat them>
```

The `Do not redo` section is the one that pays for itself. Every wrong turn recorded there is a wrong turn not taken twice.
