"""Tests for Engine.snapshot(): a non-destructive mid-session read.

Test 1 is the one that matters (see its docstring) and is written first,
per the request that created this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from vtml.config import STANDARD, EngineConfig
from vtml.fixtures.synthetic.generate import generate
from vtml.fusion.engine import Engine, Weights
from vtml.types import Observation

_HONEST_FIXTURE = (
    Path(__file__).resolve().parents[1] / "fixtures" / "synthetic" / "honest_seed7.jsonl"
)


def _load_honest_fixture() -> list[Observation]:
    with _HONEST_FIXTURE.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def test_snapshots_taken_mid_stream_never_change_the_finalised_result() -> None:
    """A session snapshotted any number of times, at any points, must
    finalise to exactly the same SessionResult -- byte-identical JSON,
    not just an equal score -- as the same session with no snapshots.
    This is the determinism guarantee snapshot() exists to preserve, so
    it is the test that actually proves the "decay on a copy" choice
    (docs/Memory.md) was the right one, not just a plausible one.
    """
    observations, _ = generate("staged", seed=7)
    session_end = observations[-1].t_ms + 1
    ordered = sorted(observations, key=lambda o: o.t_ms)

    def replay(snapshot_points: list[int]) -> str:
        engine = Engine(STANDARD, Weights(), seed=7)
        cursor = 0
        for t_ms in snapshot_points:
            batch = [o for o in ordered[cursor:] if o.t_ms < t_ms]
            cursor += len(batch)
            if batch:
                engine.ingest(batch)
            engine.snapshot(t_ms)  # mid-stream: some before, some after 60s
        remaining = ordered[cursor:]
        if remaining:
            engine.ingest(remaining)
        return engine.finalise(session_end).model_dump_json()

    # Points straddle the calibration boundary and the scripted events.
    snapshot_points = [10_000, 30_000, 59_999, 60_000, 65_000, 90_000, 130_000, 160_000]
    with_snapshots = replay(snapshot_points)
    without_snapshots = replay([])

    assert with_snapshots == without_snapshots
    # Parseable and non-trivial, so an accidental no-op replay() bug
    # (e.g. both branches returning "{}") can't slip the assertion above.
    parsed = json.loads(with_snapshots)
    assert parsed["flags"]


def test_snapshot_before_calibration_window_reports_calibrating() -> None:
    engine = Engine(STANDARD, Weights())
    result = engine.snapshot(30_000)
    assert result.status == "calibrating"
    assert result.band == "calibrating"
    assert result.score is None


def test_snapshot_after_calibration_window_reports_a_score_and_band() -> None:
    engine = Engine(STANDARD, Weights())
    result = engine.snapshot(60_000)
    assert isinstance(result.score, float)
    assert result.band in ("clear", "review", "suppressed")


def test_repeated_snapshots_on_honest_fixture_do_not_change_final_score() -> None:
    observations = _load_honest_fixture()
    engine = Engine(EngineConfig(), Weights())
    engine.ingest(observations)

    last_t_ms = max(o.t_ms for o in observations)
    for t_ms in range(0, last_t_ms, 5_000):
        engine.snapshot(t_ms)

    result = engine.finalise(last_t_ms)
    assert result.score == pytest.approx(93.11, abs=0.005)
    assert result.band == "clear"
    assert result.flags == []


def test_snapshot_does_not_mutate_live_channel_state() -> None:
    """Calling decay_to() on the live ChannelState instead of a copy
    would still leave the *decayed value* mathematically equivalent, but
    would advance `last_update` and prune `recent` on the object
    finalise() later reads. Assert the live objects are untouched by
    identity, not just that the eventual score matches."""
    observations, _ = generate("staged", seed=7)
    engine = Engine(STANDARD, Weights(), seed=7)
    engine.ingest([o for o in observations if o.t_ms < 60_000])

    before = {
        channel: (state.llr, state.last_update, list(state.recent))
        for channel, state in engine._channels.items()
    }
    engine.snapshot(65_000)
    after = {
        channel: (state.llr, state.last_update, list(state.recent))
        for channel, state in engine._channels.items()
    }

    assert before == after
