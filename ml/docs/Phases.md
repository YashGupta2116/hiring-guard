# Phases: VeriTrust Integrity Engine

Component: `veritrust-ml`

Seven phases. Each one is independently testable and leaves the repo in a working state. Do not start a phase before the previous one's exit criteria all pass.

Time budget assumes the hackathon window opens 17 September and the demo video is recorded the evening of 19 September. Hours are my hours on this component, not team hours.

| Phase | What lands | Budget | Blocks |
|---|---|---|---|
| 0 | Scaffold, types, config, synthetic generator | 2 h | everything |
| 1 | Fusion core and its tests | 5 h | 2, 3, 4 |
| 2 | Detector registry, ingest, baselines | 3 h | 3 |
| 3 | Fixture capture and calibration fit | 4 h | 4 |
| 4 | Evaluation harness and report | 3 h | tuning |
| 5 | Lambda packaging and latency | 2 h | integration |
| 6 | Demo fixture and the story it tells | 2 h | the video |

Total 21 hours. That leaves room for the two things that always go wrong and one that has not been imagined yet.

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

**Exit criteria**
- A 60 s synthetic stream produces a complete baseline; a 20 s stream produces `fallback`
- Out-of-order observations inside 2 s are reordered; beyond 2 s they are accepted with a counted warning
- A duplicate `(source, seq)` is dropped and counted
- `offline_video.py` processes a 30 s test clip and emits valid observations
- Personalised threshold test: the same gaze stream against two different baselines produces different flag counts

---

## Phase 3: Fixture capture and calibration

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
- `python -m vtml.evaluate --weights weights/weights.json` produces the report and figures end to end
- Zero high-severity flags across all honest fixtures
- Flag precision at or above 0.80, recall at or above 0.70 on staged fixtures
- Median honest score at or above 90, median staged at or below 70
- Every figure is readable in greyscale

---

## Phase 5: Lambda packaging

**Goal.** The same engine runs in AWS with a bundle that fits and a cold start that does not embarrass the demo.

**Tasks**
1. `handler.py`: parse the WebSocket event, load state from DynamoDB, `Engine.from_state`, ingest, persist with a conditional write on `state_version`, return the new flags and score.
2. State serialisation round-trip test: `from_state(to_state(engine))` produces an engine that scores identically on the next batch.
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
   - minute 1, calibration, score reads `calibrating`
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
