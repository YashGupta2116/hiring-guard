# Architecture: VeriTrust Integrity Engine

Component: `veritrust-ml`
Version: 1.0

---

## 1. Shape of the thing

One Python package with two entry points that share all of their logic.

```
                 OFFLINE                              RUNTIME
                 (my laptop)                          (AWS Lambda)

  fixtures/*.jsonl                          API Gateway WebSocket
        |                                            |
        v                                            v
  vtml.replay  ---------+                     vtml.handler
        |               |                            |
        v               |                            v
  vtml.fusion.Engine <--+-------------------> vtml.fusion.Engine
        ^                                            |
        |                                            v
  weights.json  <---- vtml.calibrate            DynamoDB (state)
        ^                                            |
        |                                            v
  labelled sessions                           flags + score out
```

The engine class is identical in both paths. That is the whole design. If a fixture replays to a given score on my laptop, the Lambda produces that same score, and any divergence is a bug with a failing test rather than a mystery.

## 2. Runtime flow, one session

1. **Session open.** `Engine.__init__(config, weights)` builds six `ChannelState` objects, loads the calibration curves, seeds the RNG, sets `t0`.
2. **Calibration window, 0 to 60 s.** Observations flow in and are recorded into `BaselineBuilder`. The engine is in `observe_only` mode: no flags, no score. `integrity.status = "calibrating"`.
3. **Baseline close.** `BaselineBuilder.finalise()` returns gaze home region, head pose neutral, keystroke interval distribution, and glance rate. If it has too few samples, it returns population defaults and sets `calibration = "fallback"`.
4. **Steady state.** For each batch of observations:
   - `ingest.normalise()` validates the schema, applies the clock offset, computes `t_ms`, drops duplicates by `(source, seq)`, buffers out-of-order items for up to 2 s.
   - `calibrate.to_llr(obs, baseline)` maps confidence to a raw LLR through the fitted curve, then applies duration scaling.
   - `fusion.step()` decays every channel to `now`, applies the corroboration boost, adds to the channel accumulator, recomputes the score.
   - If the incoming effective LLR crosses the flag threshold, `fusion.emit_flag()` builds the flag and computes its score delta by re-running step 4 of the score with that evidence removed.
   - Flags of the same type and channel within 15 s extend the existing flag instead.
5. **Signal loss.** `Engine.suppress(channel, reason)` opens an unscored window. That channel stops accumulating and stops decaying until `Engine.resume(channel)`.
6. **Adjudication.** `Engine.recompute(dismissed_ids, downgraded_ids)` replays the accumulated evidence set with those terms removed or reduced. Pure function of stored evidence, no session replay.
7. **Session close.** `Engine.finalise()` decays to the end timestamp, closes open windows, returns the final `SessionResult`.

## 3. Offline flow, calibration

1. Record short sessions. Half honest, half staged with a scripted event list. Target 20 sessions of 3 to 5 minutes.
2. `vtml.record` runs in the browser harness and writes raw observations to `fixtures/raw/<session>.jsonl`.
3. `labels/<session>.json` holds the ground truth: a list of `{t_start_ms, t_end_ms, event_type}` for staged events, or an empty list for honest sessions.
4. `vtml.calibrate fit` joins observations to labels by time overlap, producing a table of `(detector, confidence, is_within_labelled_event)`.
5. For each detector, fit a logistic curve on that table. Logistic and not isotonic: with 20 sessions isotonic overfits into a step function and produces LLRs of plus and minus infinity.
6. Convert fitted probabilities to LLR, clamp to `[-1.0, 4.0]`, write `weights.json` with a version string.
7. `vtml.evaluate` replays every fixture through the engine with the new weights and writes `reports/eval-<version>.md` plus figures.

A detector with fewer than 15 positive examples does not get a fitted curve. It gets the hand-set prior in `priors.py`, and `weights.json` records `"source": "prior"` for it. This is expected for rarer detectors and must be visible in the eval report rather than hidden.

## 4. Data contracts

Three types cross a boundary. They are Pydantic models and they are the only stable API.

```python
class Observation(BaseModel):
    seq: int
    t_ms: int                      # session-relative, after clock correction
    channel: Channel               # gaze|scene|focus|input|network|audio
    type: str                      # "gaze.offscreen"
    confidence: float              # 0..1, raw detector output
    duration_ms: int | None
    features: dict[str, float]     # numeric only, no text, no identifiers
    detector: str                  # "mp.gaze@1.0.0"
    source: Source                 # browser|offline|synthetic

class Flag(BaseModel):
    id: str
    t_start_ms: int
    t_end_ms: int
    channel: Channel
    type: str
    severity: Severity             # low|medium|high
    llr: float
    score_delta: float             # points this flag cost, computed not estimated
    corroborated_by: list[Channel]
    observation_ids: list[int]     # seq values
    narrative: str                 # templated, states observation not inference
    media_offset_ms: int

class SessionResult(BaseModel):
    score: float | None            # None while calibrating
    status: Literal["calibrating","scoring","degraded"]
    band: Literal["clear","review","suppressed"]
    channels: dict[Channel, float]
    flags: list[Flag]
    unscored: list[UnscoredWindow]
    calibration: Literal["complete","fallback"]
    weights_version: str
```

`features` is `dict[str, float]` and nothing else. No strings, so no transcript fragment, no filename, no key identity can enter the engine even by accident. This enforces PRD constraint 5 at the type level.

## 5. Folder structure

```
veritrust-ml/
  pyproject.toml
  README.md
  docs/
    PRD.md
    Architecture.md
    Rules.md
    Phases.md
    Design.md
    Memory.md                    # created in Phase 1, updated every phase
  src/vtml/
    __init__.py
    types.py                     # the three models above, Channel, Severity enums
    config.py                    # EngineConfig, sensitivity presets
    priors.py                    # hand-set LLR priors, the fallback when unfitted
    ingest.py                    # validate, clock-correct, dedupe, reorder
    baseline.py                  # BaselineBuilder, the 60 s window
    calibrate/
      __init__.py
      fit.py                     # logistic fit per detector, writes weights.json
      curves.py                  # confidence -> LLR at runtime
      dataset.py                 # join observations to labels
    fusion/
      __init__.py
      engine.py                  # Engine: the public surface
      channel.py                 # ChannelState, decay, accumulate
      corroborate.py             # the 6 s window, boost and damping
      score.py                   # weighted sum, sigmoid, bands
      flags.py                   # emission, merging, severity, score_delta
      narrate.py                 # templates, one per detector type
      windows.py                 # unscored window bookkeeping
    detectors/
      __init__.py
      schema.py                  # the detector type registry, one row per type
      offline_video.py           # MediaPipe over a recorded mp4, for fixtures
    replay.py                    # run a fixture through the engine
    evaluate/
      __init__.py
      metrics.py                 # precision, recall, separation, latency
      figures.py                 # plots, styled per Design.md
      report.py                  # writes reports/eval-<version>.md
    handler.py                   # Lambda entry, the only AWS-aware module
  weights/
    weights.json                 # the shipped artifact
    weights.schema.json
  fixtures/
    raw/*.jsonl
    labels/*.json
    synthetic/*.jsonl
  reports/
  tests/
    test_types.py
    test_ingest.py
    test_fusion_math.py
    test_corroboration.py
    test_flags.py
    test_windows.py
    test_ethics.py               # PRD section 9, one test per constraint
    test_determinism.py
    test_replay_golden.py
```

`handler.py` is the only file that imports boto3. Everything else is pure Python and runs with no cloud, no network and no credentials. This is what keeps the component testable in the three days we have.

## 6. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.11 | Lambda runtime, matches the rest of the backend |
| Models | Pydantic v2 | Validation at the boundary, and the `dict[str, float]` constraint is enforced not documented |
| Numerics | NumPy | Decay and sums, nothing heavier is needed |
| Fitting | scikit-learn | `LogisticRegression` plus the metrics. Used offline only |
| Tables | pandas | Offline dataset joins only. Not imported by the runtime path |
| Figures | matplotlib | Eval plots, styled per Design.md |
| Perception, browser | MediaPipe Tasks for Web | FaceLandmarker and FaceDetector, runs on the candidate's machine, no server GPU |
| Perception, offline | mediapipe Python | Generates fixture observations from recorded mp4 |
| Tests | pytest, pytest-benchmark | Golden fixtures and the latency budget |
| Packaging | uv or pip with a locked requirements file | Lambda zip under 50 MB without pandas or sklearn |
| Runtime deps | pydantic, numpy only | sklearn, pandas and matplotlib are dev extras and must not enter the Lambda bundle |

The runtime dependency set is two packages. That is a hard boundary, tested in Phase 5 by importing `vtml.handler` in a clean environment with only those two installed.

## 7. Browser and Python parity

The browser runs MediaPipe and computes raw features. It does **not** compute LLRs and holds no weights. It emits `Observation` objects over the socket and nothing else.

This split matters for three reasons: thresholds never reach a client that could be tuned against them, the same observation stream can be replayed offline for testing, and the fusion logic exists in exactly one language.

Parity risk: the offline video path uses MediaPipe Python and the live path uses MediaPipe Web. Landmark output differs slightly between them. Mitigation in Phase 4: record one session through both paths, diff the resulting feature distributions, and if the medians differ by more than 10 percent, calibrate on browser-captured fixtures only and use the Python path for volume, not for fitting.

## 8. Lambda integration

```
API Gateway WebSocket
  route $default -> ingest Lambda
      |
      v
  load engine state from DynamoDB (pk = session_id)
  Engine.from_state(state, weights)
  Engine.ingest(batch)
      |
      +-> new flags?  -> write flags, push to dashboard connection
      +-> score moved? -> push integrity tick
      v
  persist state back to DynamoDB
```

Engine state serialises to a dict of channel accumulators, open windows, baselines and the flag list. Target under 100 KB per session so it fits a DynamoDB item comfortably. If it approaches 300 KB, flags move to their own table and state keeps ids only.

Cold start budget: the module imports pydantic and numpy and loads a roughly 20 KB weights file. Measure it in Phase 5, target under 800 ms.

Concurrency: one session is one DynamoDB item, and batches for a session arrive in order over one socket. A conditional write on a monotonic `state_version` guards the update. On a conflict, re-read and re-apply the batch. Do not build a distributed lock for a hackathon.

## 9. Failure behaviour

| Failure | Engine behaviour |
|---|---|
| Malformed observation | Drop it, count it, open no window. A bad row is not evidence |
| Detector stops reporting for over 10 s | Open an unscored window for that channel |
| Baseline never completes | Population defaults, `calibration = "fallback"` |
| Weights file missing or version mismatch | Refuse to start. Never fall back to uncalibrated scoring silently |
| DynamoDB read fails | Reconstruct from the observation log if available, otherwise start a fresh engine and mark everything before now as unscored |
| Latency budget exceeded | Log it, still return. Never drop evidence to hit a deadline |

Every one of these ends in either a correct score or an explicit absence of one. None of them ends in a higher suspicion than the evidence supports.
