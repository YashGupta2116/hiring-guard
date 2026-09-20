# veritrust-ml

veritrust-ml turns gaze, scene, focus, and input signals into a continuous integrity score (0-100) and a list of explainable flags. It never outputs a verdict: no boolean `is_cheating` field exists anywhere in the schema, and every flag carries its own evidence and the exact points it cost the score. A signal gap opens an unscored window instead of counting as suspicion.

The engine is a calibrated log-likelihood-ratio fusion system, not a neural network. It trains on tens of labelled examples instead of tens of thousands, each flag's score is a computed fact instead of a guess, and a reviewer's dismissal recomputes the score exactly.

## Install

```bash
cd ml
python -m venv .venv
source .venv/Scripts/activate  # .venv\Scripts\activate on cmd.exe, .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
```

## Run the tests

```bash
pytest
mypy
```

`pyproject.toml`'s `[tool.mypy]` section sets `strict = true` and `files = ["src"]`, so bare `mypy` is the type gate for the whole package and should pass clean.

## Generate a synthetic fixture

```bash
python -m vtml.fixtures.synthetic.generate --profile honest --seed 7
python -m vtml.fixtures.synthetic.generate --profile staged --seed 7
```

Both write a deterministic JSONL stream of `Observation` records to `fixtures/synthetic/`. A staged session also writes a `.labels.json` file alongside it with the scripted event list (`t_start_ms`, `t_end_ms`, `event_type`) used as ground truth.

Four more profiles exist. `honest_clean`, `honest_noisy_camera` and `staged_phone_and_glance` are the golden fixtures (below). `staged_calibration` is for fitting: it keeps the staged script's event types, timings and durations but varies their confidence and adds detector misfires, because a curve over a single fixed confidence value is unidentifiable.

## Replay the golden fixtures

```bash
pytest tests/test_replay_golden.py
python -m vtml.fixtures.golden          # rewrite the committed expected results
```

Three sessions in `fixtures/golden/` replay to a committed `SessionResult`: `honest_clean` (94.61,
clear), `honest_noisy_camera` (89.29, clear -- a bad webcam, poor lighting and a dropped connection,
which must stay above 85) and `staged_phone_and_glance` (11.99, suppressed, 3 flags). A change to any
fusion constant changes these files, and reviewing that diff is the point; regenerate deliberately
rather than to make a test green.

## Fit calibration curves

```bash
python -m vtml.calibrate.dataset --fixtures fixtures/calibration
python -m vtml.calibrate.fit --fixtures fixtures/calibration \
    --version phase3-synthetic-1 --dataset-kind synthetic --write-schema
```

The first command prints the fitting table: how many positives and negatives each detector has, and
whether it has enough to fit. The second fits one logistic per detector over its raw confidence,
converts it to an LLR by removing the dataset's class prior, and writes `weights/weights.json` plus
the schema generated from the Pydantic model in `src/vtml/weights.py`.

The committed artifact is fitted on **synthetic** fixtures -- it records that as
`dataset.kind: "synthetic"`, and a curve fitted on generated data is not evidence about real
behaviour. Phase 3's 20 recorded sessions are still owed; see `docs/REMAINING_WORK.md`.

To score with the fitted curves instead of the hand-set priors:

```python
from pathlib import Path
from vtml.config import STANDARD
from vtml.fusion.engine import Engine, Weights

engine = Engine(STANDARD, Weights.from_file(Path("weights/weights.json")))
```

`Weights()` with no argument keeps every detector on its `priors.py` entry, which is what the locked
regression baseline and the golden fixtures are pinned against.

## Replay the demo

```bash
python -m vtml.replay --speed 0    # dump instantly
python -m vtml.replay --speed 1    # real time (default)
python -m vtml.replay --speed 10   # for screen recording
```

Streams `fixtures/demo_session.jsonl` through the engine and prints its five beats as they happen: a calibration window that costs the candidate nothing, a single gaze glance that accumulates but never flags, a corroborated gaze-and-scene flag, a reviewer's dismissal that restores the score exactly, and a signal-loss window that moves the score in neither direction. The fixture regenerates with `python -m vtml.fixtures.synthetic.generate --profile demo --seed 7 --out-dir fixtures`.

## Run the evaluation

```bash
python -m vtml.evaluate
```

Replays `honest_seed7` and `staged_seed7` through the engine, on `priors.py` since no fitted weights exist yet, and writes `reports/eval-phase1-priors.md` plus four figures. The report opens by stating what two synthetic fixtures can and cannot support: no fitted detector, no recorded session, and no precision, recall or population median. When `fixtures/demo_session.jsonl` exists, the same command also writes `reports/demo_timeline.png`/`.svg` (the F4 timeline over the demo fixture, with its dismissed flag drawn at reduced opacity and struck through) and `reports/demo-walkthrough.md`, the one-page narration script for the demo video. `reports/` is gitignored in full and rebuilds from tracked fixtures and code alone.

## Prior-sensitivity sweep and calibration ablation

```bash
python -m vtml.evaluate.priors_sweep        # writes reports/f5_prior_sensitivity_sweep.{csv,png,svg}
python -m vtml.evaluate.calibration_ablation # prints the pre-/post-fix score comparison
```

Out-of-phase fairness checks against `honest_seed7`/`staged_seed7`: whether the verdict survives a 0.25x-4x sweep of each channel's hand-set prior, and what the calibration-window fix actually changed. See `docs/reports/prior-sensitivity-18sep.md`.

## Detector types

Every detector type string, its channel, its backend wire mapping, and its hand-set prior live in one place: `src/vtml/detectors/schema.py`. Nothing else in `src/vtml/` hardcodes one as a literal -- `tests/test_registry.py` asserts that.

## Status

Phase 0 (scaffold), Phase 1 (fusion core), Phase 2 (detector registry, ingest, baselines), Phase 4 (evaluation harness and report) and Phase 6 (demo fixture, replay, walkthrough) are complete. Phase 3 is partial: its calibration pipeline, artifact and engine path are built and tested, but the 20 recorded sessions it needs are not captured, so the shipped curves are fitted on synthetic fixtures. Phase 5 (Lambda packaging) is still cut, though its state-serialisation criterion is met (`tests/test_state_roundtrip.py`). See `docs/Memory.md` for current state and key decisions, `docs/Phases.md` for the phase detail, and `docs/REMAINING_WORK.md` for what is left.

`backend/` still runs its own independent fusion engine live; this component is not a second runtime. What is new is an **artifact** seam: `backend/src/config/calibrated-weights.ts` reads `weights/weights.json` and adopts the fitted magnitudes into its own LLR table, behind a flag that is off by default. Nothing calls Python and no process talks to another. See [`../docs/cross-component-architecture.md`](../docs/cross-component-architecture.md) for the shape of it and what it deliberately does not do.
