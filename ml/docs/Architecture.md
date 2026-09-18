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

1. **Session open.** `Engine.__init__(config, weights)` builds six `ChannelState` objects, seeds the RNG, sets `t0`. There are no fitted calibration curves until Phase 3; every detector scores off its `priors.py` entry, and `weights` carries only the version string that `SessionResult.weights_version` reports. `weights=None` raises rather than scoring on priors silently.
2. **Calibration window, 0 to 60 s.** Observations flow in and are recorded into `BaselineBuilder` and nothing else (`Engine._process_one`, corrected Phase 4): no LLR, no `state.recent` entry, no flag. An observation inside the window still counts as accepted and still counts toward the baseline's per-signal sample minimums, but contributes nothing to score, directly or via decay -- the window is a hard boundary for evidence, not a soft one, so a later observation cannot corroborate against one from inside it (PRD section 3). A live read in this window (`Engine.snapshot(t_ms)`, below) reports `status = "calibrating"` and `score = None`.
3. **Baseline close.** `BaselineBuilder.finalise()` returns gaze home region, head pose neutral, keystroke interval distribution, and glance rate, closing either on the first observation whose `t_ms` reaches the window or, for a session that ends first, inside `Engine.finalise()`. If it has too few samples, it returns population defaults and sets `calibration = "fallback"`.
4. **Steady state.** For each batch of observations:
   - `ingest.normalise()` validates the schema, applies the clock offset, computes `t_ms`, drops duplicates by `(source, seq)`, buffers out-of-order items for up to 2 s.
   - `Engine._observation_llr` reads the detector's prior and applies duration scaling. From Phase 3 this reads a fitted curve instead; the call site does not change.
   - `fusion.step()` decays every channel to `now`, applies the corroboration boost, adds to the channel accumulator, recomputes the score.
   - If the incoming effective LLR crosses the flag threshold, `fusion.emit_flag()` builds the flag and computes its score delta by re-running step 4 of the score with that evidence removed.
   - Flags of the same type and channel within 15 s extend the existing flag instead.
5. **Live read, any time.** `Engine.snapshot(t_ms)` returns a `SessionResult` without ending the session: it decays a *copy* of each channel to `t_ms` and builds the result through the same assembly `finalise()`/`recompute()` use, but never touches the live channels, never closes a window, never force-closes the baseline, and never emits or merges a flag. Any number of snapshots leave a session's eventual `finalise()` result identical to taking none (`tests/test_snapshot.py`). This is what a live score gauge or a session timeline chart (Design.md F4) samples from mid-session; `ingest()` itself still only returns an `IngestResult`.
6. **Signal loss.** `Engine.suppress(channel, reason)` opens an unscored window. That channel stops accumulating and stops decaying until `Engine.resume(channel)`.
7. **Adjudication.** `Engine.recompute(dismissed_ids, downgraded_ids)` replays the accumulated evidence set with those terms removed or reduced. Pure function of stored evidence, no session replay.
8. **Session close.** `Engine.finalise()` decays to the end timestamp, closes open windows, returns the final `SessionResult`.

## 3. Offline flow, calibration

**Cut for the hackathon (Phases.md Phase 3).** The flow below is still the intended design and nothing in it is wrong -- it just has no recordings to run on. Phase 4 (evaluate/, section 5) runs on the two synthetic `_seed7` fixtures and `priors.py` instead, and its report says so in its own first block.

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
    band: Literal["clear","review","suppressed","calibrating"]
    channels: dict[Channel, float]
    flags: list[Flag]
    unscored: list[UnscoredWindow]
    calibration: Literal["complete","fallback"]
    weights_version: str
```

`SessionResult` is no longer reachable only by ending a session. `Engine.finalise()` and `Engine.recompute()` still produce one, but so does `Engine.snapshot(t_ms)` (section 2 step 5), a non-destructive mid-session read. `band` gained the fourth `"calibrating"` value this needed -- Design.md section 1 already defined it (`sand/400`, "no score yet") and section 7 already mapped `status = "calibrating"` to that same rendering; the type just hadn't caught up until something produced the value.

### Crossing into the backend

These three models are the engine's contract and they do not change to suit storage. The backend's Prisma schema stores something different, and `wire.py` translates:

- The backend `MonitoringChannel` enum has eleven values. `gaze`, `scene` and `focus` map one to one. `input` splits into `PASTE`, `RHYTHM` and `POINTER` by detector type, read from the registry row. `network` has no enum value and becomes an `UnscoredWindow` row with reason `SIGNAL_LOSS`, which is what a dropped connection already is here. `audio` is inert in v1 and stays off the wire.
- The backend `Observation` row has no duration column. It carries `clientTs`, `ts`, `receivedAt` and `payload Json`, so `duration_ms` travels inside `payload`. If it is absent on the way back in, every event reads as a point event at `scale = 1.0` and interval detectors stop scaling without any error.
- Backend `seq` is gapless and gateway-assigned with a `prevHash`/`hash` chain. Preserve it, never renumber.

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
    calibrate/                   # Phase 3. Does not exist yet
      __init__.py
      fit.py                     # logistic fit per detector, writes weights.json
      dataset.py                 # join observations to labels
    wire.py                      # engine channels -> backend enum, Phase 2
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
    replay.py                    # Phase 6: `python -m vtml.replay`, streams
                                  # fixtures/demo_session.jsonl and prints its
                                  # five beats. No matplotlib/pandas/sklearn
                                  # import -- test_runtime_deps.py scans it too
    evaluate/                    # Phase 4: two synthetic fixtures + priors,
                                  # not the 20-recording harness section 3
                                  # designs -- Phase 3 is cut
      __init__.py
      __main__.py                # `python -m vtml.evaluate`, no arguments
      vtml.mplstyle               # Design.md section 4, loaded by figures.py
      metrics.py                 # what two fixtures actually support: scores,
                                  # channel contributions, sensitivity sweep,
                                  # flag/label matching, batch latency -- not
                                  # precision, recall or a population median
      figures.py                 # F1-F4, styled per Design.md; TOKENS is the
                                  # only other place besides vtml.mplstyle
                                  # allowed to name a colour
      report.py                  # writes reports/eval-<version>.md
    handler.py                   # Lambda entry, the only AWS-aware module
  weights/
    weights.json                 # the shipped artifact
    weights.schema.json
  fixtures/
    raw/*.jsonl
    labels/*.json
    synthetic/*.jsonl
    demo_session.jsonl           # Phase 6: the fixed demo fixture (not
    demo_session.labels.json     # seed-suffixed -- only one ever exists)
  reports/                       # gitignored in full: everything under it is
                                  # regenerated by `python -m vtml.evaluate`,
                                  # including demo_timeline.png/.svg and
                                  # demo-walkthrough.md (Phase 6)
  tests/                         # 84 passing as of the end of Phase 6
    test_types.py
    test_fusion_math.py
    test_corroboration.py
    test_flags.py
    test_windows.py
    test_narrate.py              # guards priors/templates key drift
    test_ethics.py               # PRD section 9, one test per constraint
    test_determinism.py
    test_synthetic_fixtures.py
    test_regression_baseline.py  # the locked honest-session baseline
    test_registry.py             # Phase 2: schema.py is the only source of a type string
    test_ingest.py               # Phase 2
    test_baseline.py             # Phase 2: sufficiency, KS test, personalised thresholds
    test_wire.py                 # Phase 2: engine channel -> backend enum mapping
    test_offline_video.py        # Phase 2: against a synthesised frame sequence
    test_runtime_deps.py         # Phase 4: Rules.md section 3's import rule
    test_demo_replay.py          # Phase 6: the five demo beats, in order,
                                  # dismissal exactness, replay determinism
    test_replay_golden.py        # Not built. Tagged Phase 4 here historically,
                                  # but neither Phases.md's Phase 4 task list nor
                                  # its handoff called for it, and the golden
                                  # fixtures Rules.md section 8 names
                                  # (honest_clean, honest_noisy_camera,
                                  # staged_phone_and_glance) were never built in
                                  # Phase 0/1 either -- a different, still-open
                                  # fixture set from the two _seed7 ones Phase 4
                                  # actually uses
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
