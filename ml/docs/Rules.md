# Rules: VeriTrust Integrity Engine

Component: `veritrust-ml`
These rules bind every coding session on this repo. When a rule and a convenience conflict, the rule wins.

---

## 1. Hard boundaries for the AI

**Never do these.** If a task seems to require one, stop and say so instead.

- Do not run any git command. No commit, no push, no branch, no tag, no checkout. I run git myself.
- Do not deploy, configure AWS, create IAM roles, or run anything that touches a live account.
- Do not invent training data. If a fixture is missing, generate it with the synthetic generator and label it `source: "synthetic"`, or say the fixture is needed. Never fabricate a labelled recording.
- Do not report a metric that was not produced by running the evaluation harness. No estimated precision, no "roughly 0.85".
- Do not add a dependency that is not in the approved list in section 3. Ask first.
- Do not change the fusion constants in section 5 to make a test pass. If a test fails, the code or the test is wrong, not the constant.
- Do not edit files under `fixtures/labels/`. Ground truth is human-assigned.
- Do not touch anything outside this repo.

## 2. What to do every time

- Read `docs/Memory.md` first, before any other file. It is the source of truth for what already exists.
- Work inside the current phase from `docs/Phases.md`. Do not start the next phase early.
- Run `pytest` before declaring a task complete. A task with failing tests is not complete.
- At the end of every phase, update **all affected docs**, not just `Memory.md`. If the phase changed the folder layout, `Architecture.md` changes. If it changed a constant, the value in `Rules.md` section 5 changes. If it changed scope, `PRD.md` changes. Doc drift is the failure mode this doc set exists to prevent.
- Update `README.md` when the public surface or the run commands change.
- Docs prose goes through copywriting, then copy-editing, then stop-slop before it is considered done.

## 3. Libraries

### Runtime, allowed (these two, and nothing else)
`pydantic>=2.5`, `numpy>=1.26`

### Development, allowed
`pytest`, `pytest-benchmark`, `scikit-learn`, `pandas`, `matplotlib`, `mediapipe` (offline fixture generation only), `opencv-python-headless` (video decode for fixtures only)

### Banned outright
- `torch`, `tensorflow`, `keras`, `jax`. There is no neural network in this component. If a task feels like it needs one, the task is out of scope.
- `scipy` as a runtime dependency. Any special function needed at runtime is ten lines of NumPy. Sigmoid is `1 / (1 + np.exp(-x))`.
- `requests`, `httpx`, `urllib3` anywhere in `src/vtml/` except `handler.py`. The engine makes no network calls.
- `boto3` anywhere except `handler.py`.
- Any plotting library other than matplotlib.
- Any library for "explainable AI". The explainability here is arithmetic, and a SHAP dependency would be both slower and less honest.

### The import rule, enforced by a test
`tests/test_runtime_deps.py` imports every module under `src/vtml/` except `handler.py`, `calibrate/`, `evaluate/`, and `detectors/offline_video.py`, and asserts that no `sklearn`, `pandas`, `matplotlib`, `cv2`, `mediapipe` or `boto3` is loaded afterwards. This test is the reason the Lambda bundle stays small, so it does not get skipped.

As of 2026-09-20 it runs the import in a **subprocess**. `sys.modules` is process-wide, so reading it in-process measured the whole pytest session rather than this import graph: once `tests/test_calibrate.py` imported `vtml.calibrate.fit`, scikit-learn was already loaded and the assertion fired on an import the test never made. A fresh interpreter is the only place the question has a meaningful answer, and it makes the result independent of test ordering.

`pyproject.toml` carries one `[[tool.mypy.overrides]]`, for `sklearn.*`, because scikit-learn ships no stubs and no `py.typed` marker. It sets `ignore_missing_imports` for that package and nothing else; the modules importing it stay fully checked.

## 4. Code rules

- Type hints on every public function. `pyproject.toml` carries a `[tool.mypy]` section setting `strict = true` and `files = ["src"]`, so bare `mypy` is the type gate and it covers the whole package. It is clean and it stays clean. Do not narrow the scope to make a module pass.
- No mutable default arguments. No module-level mutable state. The engine holds all state on the instance.
- Every random draw goes through a seeded `np.random.Generator` held on the instance. `np.random.seed` at module level is banned.
- No `print` in `src/`. Use the stdlib `logging` module. The Lambda path logs structured JSON.
- Functions over classes, except where state genuinely persists across calls (`Engine`, `ChannelState`, `BaselineBuilder`).
- Constants live in `config.py` or `priors.py`, never inline in a function body. A magic number in `fusion/` is a bug.
- Comments explain why, never what. `# decay to now` above a decay call is noise. `# tau is per channel because gaze evidence ages faster than a pasted block` is worth writing.
- No AI attribution anywhere. No model names, no "generated by", no co-authored-by, in any file, comment, docstring or commit message draft.

## 5. Fusion constants

These are the specification. Changing one is a deliberate decision that updates this table, the code, and the eval report together.

| Constant | Value | Where |
|---|---|---|
| LLR clamp | `[-1.0, 4.0]` | `config.py` as `llr_clamp_min`, `llr_clamp_max` |
| Duration scale `d0` | 1500 ms | `config.py` as `duration_scale_ms` |
| Duration saturation `d_sat` | 20000 ms | `config.py` as `duration_saturation_ms` |
| Decay tau, gaze | 180 s | `config.py` |
| Decay tau, audio | 300 s | `config.py` |
| Decay tau, scene | 240 s | `config.py` |
| Decay tau, focus | 300 s | `config.py` |
| Decay tau, input | 420 s | `config.py` |
| Decay tau, network | 120 s | `config.py` |
| Corroboration window | 6 s | `fusion/corroborate.py` |
| Corroboration boost | `1 + 0.45 * (n_channels - 1)`, cap 2.35 | `fusion/corroborate.py` |
| Same-channel damping | 0.6 | `fusion/corroborate.py` |
| Channel weights | gaze 1.0, audio 1.25, scene 1.15, focus 1.1, input 0.9, network 0.0 | `weights.json` |
| Score midpoint `m` | lenient 3.2, standard 2.2, strict 1.5 | `config.py` |
| Score slope `s` | 1.6 | `config.py` |
| Flag threshold | 0.8 effective LLR | `fusion/flags.py` |
| Severity cuts | low below 1.5, medium below 3.0, high above | `fusion/flags.py` |
| Merge window | 15 s | `fusion/flags.py` |
| Calibration window | 60 s | `baseline.py` |
| Decay tick | 200 ms | `fusion/engine.py` |
| Gaze personalised yaw tolerance | 15 degrees | `config.py` as `gaze_personalised_yaw_threshold_deg` |
| Rhythm anomaly window | 30 s | `config.py` as `rhythm_window_s` |
| Rhythm anomaly KS D threshold | above 0.35 | `config.py` as `rhythm_ks_d_threshold` |
| Rhythm anomaly KS p threshold | below 0.01 | `config.py` as `rhythm_ks_p_threshold` |
| Rhythm anomaly burst rate | 8 chars/s or more | `config.py` as `rhythm_burst_rate_threshold` |
| Baseline sufficiency, gaze | 5 samples minimum | `config.py` as `baseline_min_gaze_samples` |
| Baseline sufficiency, keystroke | 10 samples minimum | `config.py` as `baseline_min_keystroke_samples` |

`network` weight is 0.0 in v1 and that is intentional, not a placeholder. See PRD section 5.

A zero-weight channel also cannot **corroborate** another channel, as of 2026-09-20. Keeping it out
of the weighted sum was not enough on its own: as a corroborator it re-entered the score through the
boost it handed a real channel, so a candidate's dropped connection cost 2.674 points and raised a
flag narrated "corroborated by network" -- against PRD section 5's "never a penalty to the
candidate". No constant in this table changed; the rule is in `fusion/corroborate.py` and is tested
by `tests/test_corroboration.py`.

`calibrate/curves.py` does not exist. Since 2026-09-20 the fitting lives in `calibrate/fit.py`
(offline, never imported by the runtime) and its output in `weights/weights.json`. The engine's
`fusion/engine.py::_base_llr` reads a fitted curve for a detector that has one and falls back to
`priors.py` for every detector that does not, which is all of them under the default `Weights()`.
Duration scaling and the clamp apply on top of either, so there is still one scoring path. The three
constants above moved to `config.py` with the rest.

The shipped artifact fits 4 of 16 detectors, on **synthetic** fixtures. `dataset.kind` records that,
and a curve fitted on generated data is not evidence about real behaviour -- Phase 3's recorded
sessions are still owed.

### Duration scaling

```
scale = min(1.0, log1p(duration_ms / d0) / log1p(d_sat / d0))
```

`duration_ms = None` means a point event, a completed discrete action such as a paste, and scores at `scale = 1.0`. The formula defines behaviour for a known duration only; folding a null into it at duration zero would score an instant action as nothing and silently defeat `input.large_paste`, the strongest single-observation signal in `priors.py`.

An earlier linear form, `clamp(duration_ms, d0, d_sat) / d0`, scaled to roughly 13.3x and let one long gaze event alone reach the LLR clamp. It is wrong. Do not reintroduce it.

### Score bands

| Band | Range |
|---|---|
| clear | 85 to 100 |
| review | 70 to 84 |
| suppressed | below 70 |

These are shared with the product gauge and owned by `Design.md` section 1. They also match the backend, which nulls `Report.compositeScore` below 70. Changing one of these three numbers changes all three places.

### Baseline sufficiency

`baseline.py::BaselineBuilder.finalise(now_ms)` treats "not enough data" as two independent questions, not one:

- **The calibration window itself.** `t_ms` is session-relative from open, so the window is simply `[0, calibration_window_s * 1000)`. A session that closes before that elapses sets `Baseline.fallback = True` and `SessionResult.calibration = "fallback"` regardless of how much evidence arrived in the time it had.
- **Per-signal sample counts.** Even across a full window, gaze pose and keystroke interval samples below `baseline_min_gaze_samples` / `baseline_min_keystroke_samples` fall back to the population default for that field alone, without forcing `fallback` on the whole baseline. A candidate who never types in the first 60 s is not calibration failure; it is a quiet 60 s.

### The locked baseline

`tests/test_regression_baseline.py` pins the honest synthetic session (seed 7) at score 94.28386762280083, band `clear`, zero flags, empty `diagnostics`, and these exact per-channel contributions:

| Channel | Contribution |
|---|---|
| gaze | 0.1582772816645856 |
| focus | 0.26348787968391063 |
| scene, input, network, audio | 0.0 |

Every later phase is measured against this. Do not edit the file, relax its tolerances, or mark it skipped. If it fails, either the change is wrong or the change is deliberate; stop and explain which before continuing.

## 6. Ethical rules, enforced by tests in `tests/test_ethics.py`

One test per rule. These tests do not get marked xfail.

1. **No verdict field.** Assert the JSON schema of `SessionResult` and `Flag` contains no boolean field whose name matches `cheat|verdict|guilty|pass|fail`.
2. **Absence is never evidence.** Replay a fixture, then replay it with a 90 second hole cut out of one channel. Assert the score of the holed run is greater than or equal to the full run, and that an unscored window appears.
3. **Flags reconstruct.** For every flag in a replay, recompute its `score_delta` from its observation ids and assert it matches to within 1e-9.
4. **Narratives are neutral.** Assert no narrative template contains any word from the banned list: `cheat`, `cheating`, `dishonest`, `suspicious`, `guilty`, `caught`, `violation`, `misconduct`, `lying`, `fraud`.
5. **No text enters the engine.** Assert `Observation.features` rejects a non-float value at validation.
6. **Output carries its own caveats.** Assert `SessionResult` always populates `weights_version`, `calibration` and `unscored`, even on a clean session where `unscored` is empty.
7. **Dismissal only ever raises the score.** Property test: for any fixture and any subset of flags dismissed, the recomputed score is greater than or equal to the original.

## 7. Error handling

- **Validation errors at the boundary.** Every observation passes through Pydantic at ingest. A failure increments `dropped_invalid` and is logged with the detector name. It never raises out of `Engine.ingest`.
- **`Engine.ingest` never raises.** It returns an `IngestResult` carrying accepted, dropped and reordered counts. The caller is a Lambda handling a live session and must not 500 because a detector sent a bad float.
- **`Engine.finalise` may raise.** A corrupt terminal state should fail loudly, because the alternative is a report built on nonsense.
- **Missing weights is fatal at construction.** `Engine(weights=None)` raises. Never score with priors silently.
- **Unknown detector type.** Drop the observation, count it under `unknown_detector`, and surface the count in `SessionResult.diagnostics`. Do not guess a curve for it.
- **NaN or infinity anywhere in the math.** Assert-guard at the end of `fusion/score.py`. If the score is not finite, return the previous score, set `status = "degraded"`, and log the channel accumulators. Never return NaN to a UI.
- **Clock anomaly.** An observation whose corrected timestamp is more than 5 s from the receive time is accepted into the log, emits a `network.clock_anomaly` observation with weight zero, and is excluded from the evidence sum.

## 8. Testing rules

- Every fusion function has a unit test with hand-computed expected values. Not a snapshot of whatever the code currently produces.
- Golden fixtures: three sessions (`honest_clean`, `honest_noisy_camera`, `staged_phone_and_glance`) replay to a committed expected `SessionResult`. Any change to the constants changes these goldens, and that diff is the review surface. **Built 2026-09-20**: `fixtures/golden/` holds the three fixtures and their `<name>.expected.json`; `tests/test_replay_golden.py` is the consumer; regenerate with `python -m vtml.fixtures.golden` and review the diff rather than accepting it.
- `honest_noisy_camera` is the most important test in the repo. A session with a bad webcam, poor lighting and a dropped connection must score above 85. If it does not, the false-positive behaviour is broken regardless of what the other metrics say. It currently scores 89.29. That margin depends on how bad "a bad webcam" is taken to be: the fixture models sub-second face-detection dropouts at about one per 50 s, and the bar breaks at 7 dropouts per 5 minutes (sensitivity table in `Memory.md`). If a real recording turns out noisier than that, the fix is a scene-channel change, not a gentler fixture.
- Latency test asserts p95 under 50 ms for a 20-observation batch on a session with 500 accumulated observations.
- No test depends on network, AWS, a browser or wall-clock time. Time is injected.

## 9. Scope discipline

The hackathon submission is on 20 September. Anything not in the current phase is a distraction, including:

- Tuning a constant that already passes its target
- Adding a seventh channel
- Improving the narrative templates beyond neutral and correct
- Making the eval figures prettier than Design.md specifies
- Refactoring for a future that has not arrived

If a phase finishes early, the next action is the next phase, not polish.
