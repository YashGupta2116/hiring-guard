"""Phase 6 exit criteria: fixtures/demo_session.jsonl's five beats occur in
order, each with the outcome Phases.md's Phase 6 section promises.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import (
    DEMO_CORROBORATION_SCENE_T_MS,
    DEMO_GLANCE_T_MS,
    DEMO_RESUME_T_MS,
    DEMO_SUPPRESS_CHANNEL,
    DEMO_SUPPRESS_REASON,
    DEMO_SUPPRESS_T_MS,
)
from vtml.fusion.engine import Engine, Weights
from vtml.replay import run
from vtml.types import Channel, Observation, Severity

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "demo_session.jsonl"


def _load() -> list[Observation]:
    with _FIXTURE.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def test_glance_beat_accumulates_but_emits_no_flag() -> None:
    observations = [o for o in _load() if o.t_ms <= DEMO_GLANCE_T_MS]
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.snapshot(DEMO_GLANCE_T_MS)

    assert result.flags == []
    assert result.channels[Channel.GAZE] > 0.0


def test_corroboration_beat_emits_one_medium_flag_naming_gaze() -> None:
    observations = [o for o in _load() if o.t_ms <= DEMO_CORROBORATION_SCENE_T_MS]
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.snapshot(DEMO_CORROBORATION_SCENE_T_MS)

    assert len(result.flags) == 1
    flag = result.flags[0]
    assert flag.channel == Channel.SCENE
    assert flag.severity == Severity.MEDIUM
    assert flag.corroborated_by == [Channel.GAZE]
    assert "gaze" in flag.narrative


def test_dismissal_restores_score_to_within_1e9_of_pre_flag_value() -> None:
    observations = _load()
    before_scene = [o for o in observations if o.t_ms < DEMO_CORROBORATION_SCENE_T_MS]
    through_scene = [o for o in observations if o.t_ms <= DEMO_CORROBORATION_SCENE_T_MS]

    reference = Engine(STANDARD, Weights())
    reference.ingest(before_scene)
    pre_flag_score = reference.snapshot(DEMO_CORROBORATION_SCENE_T_MS).score

    engine = Engine(STANDARD, Weights())
    engine.ingest(through_scene)
    corroborated = engine.snapshot(DEMO_CORROBORATION_SCENE_T_MS)
    flag_id = corroborated.flags[-1].id

    dismissed = engine.recompute(dismissed_ids=[flag_id])

    assert pre_flag_score is not None
    assert dismissed.score == pytest.approx(pre_flag_score, abs=1e-9)
    # Not merely close -- the leave-one-out subtraction is exact float
    # arithmetic on the same stored value, so this holds bit-for-bit.
    assert dismissed.score == pre_flag_score


def test_signal_loss_opens_and_closes_with_no_score_movement() -> None:
    observations = [o for o in _load() if o.t_ms <= DEMO_CORROBORATION_SCENE_T_MS]
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    flag_id = engine.snapshot(DEMO_CORROBORATION_SCENE_T_MS).flags[-1].id

    engine._t_now = DEMO_SUPPRESS_T_MS
    engine.suppress(DEMO_SUPPRESS_CHANNEL, DEMO_SUPPRESS_REASON)
    opened = engine.recompute(dismissed_ids=[flag_id])
    engine._t_now = DEMO_RESUME_T_MS
    engine.resume(DEMO_SUPPRESS_CHANNEL)
    closed = engine.recompute(dismissed_ids=[flag_id])

    assert opened.score == pytest.approx(closed.score, abs=1e-9)
    assert any(
        w.channel == DEMO_SUPPRESS_CHANNEL
        and w.t_start_ms == DEMO_SUPPRESS_T_MS
        and w.t_end_ms == DEMO_RESUME_T_MS
        for w in closed.unscored
    )


def test_replay_prints_five_beats_in_order() -> None:
    lines: list[str] = []
    run(0.0, lines.append)
    text = "\n".join(lines)

    positions = [text.index(label) for label in ("calibration", "glance", "corroboration", "dismissal", "signal loss")]
    assert positions == sorted(positions)


def test_replay_is_deterministic() -> None:
    first: list[str] = []
    second: list[str] = []
    run(0.0, first.append)
    run(0.0, second.append)

    assert first == second
    assert first
