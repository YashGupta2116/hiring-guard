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

## Run the evaluation

```bash
python -m vtml.evaluate
```

Replays `honest_seed7` and `staged_seed7` through the engine, on `priors.py` since no fitted weights exist yet, and writes `reports/eval-phase1-priors.md` plus four figures. The report opens by stating what two synthetic fixtures can and cannot support: no fitted detector, no recorded session, and no precision, recall or population median. `reports/` is gitignored in full and rebuilds from tracked fixtures and code alone.

## Detector types

Every detector type string, its channel, its backend wire mapping, and its hand-set prior live in one place: `src/vtml/detectors/schema.py`. Nothing else in `src/vtml/` hardcodes one as a literal -- `tests/test_registry.py` asserts that.

## Status

Phase 0 (scaffold), Phase 1 (fusion core), Phase 2 (detector registry, ingest, baselines), and Phase 4 (evaluation harness and report) are complete. Phase 3 (fixture capture and calibration) and Phase 5 (Lambda packaging) are cut for the hackathon. See `docs/Memory.md` for current state, key decisions, and the next action.
