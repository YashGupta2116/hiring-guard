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

## Detector types

Every detector type string, its channel, its backend wire mapping, and its hand-set prior live in one place: `src/vtml/detectors/schema.py`. Nothing else in `src/vtml/` hardcodes one as a literal -- `tests/test_registry.py` asserts that.

## Status

Phase 0 (scaffold), Phase 1 (fusion core), Phase 2 (detector registry, ingest, baselines), Phase 4 (evaluation harness and report), and Phase 6 (demo fixture, replay, walkthrough) are complete -- Phase 6 was the last phase. Phase 3 (fixture capture and calibration) and Phase 5 (Lambda packaging) are cut for the hackathon. See `docs/Memory.md` for current state and key decisions, and `docs/Phases.md` for what remains undone overall.

This component is not wired into `backend/`, which runs its own independent fusion engine live. See [`../docs/cross-component-architecture.md`](../docs/cross-component-architecture.md) for how the two relate and why.
