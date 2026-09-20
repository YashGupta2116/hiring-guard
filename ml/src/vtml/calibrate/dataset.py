"""Phase 3 task 5: join observations to their labels, emit the fitting table.

A label is a ground-truth window written from the session's own script
(`fixtures/**/<session>.labels.json`): `t_start_ms`, `t_end_ms`, `event_type`.
An observation is a positive when its own interval overlaps a label window of
the *same* detector type, within a tolerance -- the same type-matched rule
`evaluate/metrics.py::match_flags` already uses for flags, so a detector is
never credited for a positive some other detector's event explains.

Everything else in the session is a negative, including observations from a
staged session that fall outside every scripted window. That is deliberate:
the ambient glances in a staged recording are honest behaviour that happens to
share a session with a scripted event, and treating them as positives is how a
fit learns "this candidate" instead of "this behaviour".
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from vtml.types import Channel, Observation

logger = logging.getLogger(__name__)

# An observation's interval may sit this far from a label window and still
# count as the same event. Matches the 5 s flag-matching tolerance in
# evaluate/metrics.py; a detector fires around an event, not on its first frame.
MATCH_TOLERANCE_MS = 5_000

# Phase 3 exit criteria: a detector needs this many positives before its curve
# is trusted. Below it the detector keeps its hand-set prior and says why.
MIN_POSITIVES_TO_FIT = 15


@dataclass(frozen=True)
class LabelWindow:
    t_start_ms: int
    t_end_ms: int
    event_type: str


@dataclass(frozen=True)
class Row:
    """One observation, ready to fit: the features and the ground truth."""

    session: str
    detector_type: str
    channel: Channel
    confidence: float
    duration_ms: int | None
    t_ms: int
    positive: bool


@dataclass(frozen=True)
class FittingTable:
    rows: tuple[Row, ...]
    sessions: tuple[str, ...]
    match_tolerance_ms: int

    def for_detector(self, detector_type: str) -> tuple[Row, ...]:
        return tuple(r for r in self.rows if r.detector_type == detector_type)

    def positives(self) -> Counter[str]:
        return Counter(r.detector_type for r in self.rows if r.positive)

    def negatives(self) -> Counter[str]:
        return Counter(r.detector_type for r in self.rows if not r.positive)

    @property
    def n_positives(self) -> int:
        return sum(1 for r in self.rows if r.positive)


def load_observations(path: Path) -> list[Observation]:
    with path.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def load_labels(path: Path) -> list[LabelWindow]:
    """An unlabelled session is an honest one: no scripted events, so no file."""
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        LabelWindow(
            t_start_ms=int(item["t_start_ms"]),
            t_end_ms=int(item["t_end_ms"]),
            event_type=str(item["event_type"]),
        )
        for item in raw
    ]


def _overlaps(obs: Observation, label: LabelWindow, tolerance_ms: int) -> bool:
    obs_start = obs.t_ms
    obs_end = obs.t_ms + (obs.duration_ms or 0)
    return (
        obs_start <= label.t_end_ms + tolerance_ms
        and obs_end >= label.t_start_ms - tolerance_ms
    )


def build_rows(
    session: str,
    observations: list[Observation],
    labels: list[LabelWindow],
    tolerance_ms: int = MATCH_TOLERANCE_MS,
) -> list[Row]:
    return [
        Row(
            session=session,
            detector_type=obs.type,
            channel=obs.channel,
            confidence=obs.confidence,
            duration_ms=obs.duration_ms,
            t_ms=obs.t_ms,
            positive=any(
                label.event_type == obs.type and _overlaps(obs, label, tolerance_ms)
                for label in labels
            ),
        )
        for obs in observations
    ]


def build_table(
    fixtures: list[Path], tolerance_ms: int = MATCH_TOLERANCE_MS
) -> FittingTable:
    """`fixtures` are observation JSONL paths; each one's labels are the
    sibling `<stem>.labels.json`, absent for an honest session."""
    rows: list[Row] = []
    sessions: list[str] = []
    for path in sorted(fixtures):
        session = path.stem
        sessions.append(session)
        rows.extend(
            build_rows(
                session,
                load_observations(path),
                load_labels(path.with_suffix("").with_suffix(".labels.json")),
                tolerance_ms,
            )
        )
    return FittingTable(rows=tuple(rows), sessions=tuple(sessions), match_tolerance_ms=tolerance_ms)


def discover_fixtures(roots: list[Path]) -> list[Path]:
    found: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        found.extend(p for p in sorted(root.rglob("*.jsonl")))
    return found


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build the calibration fitting table.")
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True,
                        help="fixture directories, or individual .jsonl files")
    parser.add_argument("--tolerance-ms", type=int, default=MATCH_TOLERANCE_MS)
    args = parser.parse_args(argv)

    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    paths = [p for p in args.fixtures if p.is_file()]
    paths.extend(discover_fixtures([p for p in args.fixtures if p.is_dir()]))
    table = build_table(sorted(set(paths)), args.tolerance_ms)

    pos, neg = table.positives(), table.negatives()
    logger.info(
        "%d rows from %d session(s), %d positive", len(table.rows), len(table.sessions), table.n_positives
    )
    logger.info("%-34s %9s %9s  %s", "detector", "positives", "negatives", "fittable")
    for detector_type in sorted(set(pos) | set(neg)):
        n_pos = pos[detector_type]
        logger.info(
            "%-34s %9d %9d  %s",
            detector_type,
            n_pos,
            neg[detector_type],
            "yes" if n_pos >= MIN_POSITIVES_TO_FIT else f"no (needs {MIN_POSITIVES_TO_FIT})",
        )


if __name__ == "__main__":
    main()
