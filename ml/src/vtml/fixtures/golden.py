"""The three golden sessions from Rules.md section 8, and their replay.

Each golden fixture replays to a committed `SessionResult` under
`fixtures/golden/<name>.expected.json`. A change to any fusion constant
changes those files, and that diff is the review surface -- the point is
that a constant cannot move without someone seeing what it did to a whole
session's output.

`tests/test_replay_golden.py` is the consumer. This module holds the replay
so the test and the regeneration command (`python -m vtml.fixtures.golden`)
drive the identical path rather than each describing it separately, the same
reason replay.py imports the demo beat schedule from the generator.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import GOLDEN_PROFILES, GOLDEN_SESSION_S
from vtml.fusion.engine import Engine, Weights
from vtml.types import Observation, SessionResult

logger = logging.getLogger(__name__)

GOLDEN_NAMES: tuple[str, ...] = GOLDEN_PROFILES
GOLDEN_END_MS: int = GOLDEN_SESSION_S * 1000

_GOLDEN_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "golden"


def fixture_path(name: str) -> Path:
    return _GOLDEN_DIR / f"{name}.jsonl"


def expected_path(name: str) -> Path:
    return _GOLDEN_DIR / f"{name}.expected.json"


def load(name: str) -> list[Observation]:
    with fixture_path(name).open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def replay(name: str) -> SessionResult:
    """One engine, the whole fixture in session order, finalised at the
    fixed session end. No snapshots: `snapshot()` is non-destructive by
    design, but leaving it out keeps the golden a function of the fixture
    and the constants alone."""
    engine = Engine(STANDARD, Weights())
    engine.ingest(sorted(load(name), key=lambda o: o.t_ms))
    return engine.finalise(GOLDEN_END_MS)


def _serialise(result: SessionResult) -> str:
    return json.dumps(result.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"


def write_expected(name: str) -> Path:
    path = expected_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(_serialise(replay(name)))
    return path


def read_expected(name: str) -> SessionResult:
    return SessionResult.model_validate_json(expected_path(name).read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Rewrite the committed golden SessionResults. Review the diff."
    )
    parser.add_argument("--name", choices=GOLDEN_NAMES, help="one golden; default all three")
    args = parser.parse_args(argv)

    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    for name in (args.name,) if args.name else GOLDEN_NAMES:
        result = replay(name)
        path = write_expected(name)
        score = "none" if result.score is None else f"{result.score:.2f}"
        logger.info(
            "%s -> %s  score=%s band=%s flags=%d",
            name,
            path.name,
            score,
            result.band,
            len(result.flags),
        )


if __name__ == "__main__":
    main()
