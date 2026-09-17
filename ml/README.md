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
```

`mypy --strict src/vtml/fusion/ src/vtml/types.py` is also part of the Phase 1 exit criteria and should pass clean.

## Generate a synthetic fixture

```bash
python -m vtml.fixtures.synthetic.generate --profile honest --seed 7
python -m vtml.fixtures.synthetic.generate --profile staged --seed 7
```

Both write a deterministic JSONL stream of `Observation` records to `fixtures/synthetic/`. A staged session also writes a `.labels.json` file alongside it with the scripted event list (`t_start_ms`, `t_end_ms`, `event_type`) used as ground truth.

## Status

Phase 0 (scaffold) and Phase 1 (fusion core) are complete. See `docs/Memory.md` for current state, key decisions, and the next action.
