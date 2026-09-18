"""Locks the Phase 1 honest-session baseline.

The honest synthetic fixture is the reference point every later phase is
measured against. If this test fails, scoring behaviour changed: either
the change was intended and this file gets a new expected value with a
reason, or something regressed. Never relax the assertions to make it
pass.

2026-09-18: baseline moved from 93.11 to 94.28386762280083. `Engine.
_process_one` used to accumulate LLR for observations inside the 60s
calibration window and only gate flag emission; five of this fixture's
sixteen observations land inside that window (t=12425..52802) and were
being charged against the candidate during the window the product
promises is observe-only (PRD section 3). Fixing that raised the score --
see docs/Memory.md for the full before/after. This is not drift.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from vtml.config import EngineConfig
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Observation, SessionResult

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "synthetic" / "honest_seed7.jsonl"

# Filled in from the first run. See the module docstring before editing.
_EXPECTED_SCORE = 94.28386762280083


def _load(path: Path) -> list[Observation]:
    with path.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


@pytest.fixture(scope="module")
def honest_result() -> SessionResult:
    observations = _load(_FIXTURE)
    engine = Engine(EngineConfig(), Weights())
    ingest = engine.ingest(observations)
    assert ingest.dropped == 0, "honest fixture must ingest cleanly"
    assert ingest.accepted == len(observations)
    return engine.finalise(max(o.t_ms for o in observations))


def test_score_is_unchanged(honest_result: SessionResult) -> None:
    assert honest_result.score == pytest.approx(_EXPECTED_SCORE, abs=0.005)


def test_band_is_clear(honest_result: SessionResult) -> None:
    assert honest_result.band == "clear"


def test_no_flags_on_an_honest_session(honest_result: SessionResult) -> None:
    assert honest_result.flags == []


def test_every_detector_type_is_known(honest_result: SessionResult) -> None:
    # PRIORS.get returns None for an unregistered type and the observation
    # is dropped into this counter rather than raising, so a detector
    # registry change can silently remove evidence while the score still
    # looks plausible.
    assert "unknown_detector" not in honest_result.diagnostics


def test_channel_contributions_are_unchanged(honest_result: SessionResult) -> None:
    # Per-channel values catch a weight shift between channels that leaves
    # the total score in roughly the same place. The honest fixture only
    # generates gaze and focus noise, so every other channel must sit at
    # exactly zero: a non-zero value there means evidence appeared on a
    # channel the generator never wrote to.
    expected = {
        Channel.GAZE: 0.1582772816645856,
        Channel.SCENE: 0.0,
        Channel.FOCUS: 0.26348787968391063,
        Channel.INPUT: 0.0,
        Channel.NETWORK: 0.0,
        Channel.AUDIO: 0.0,
    }
    assert set(honest_result.channels) == set(expected)
    for channel, value in expected.items():
        assert honest_result.channels[channel] == pytest.approx(value, abs=1e-9), channel