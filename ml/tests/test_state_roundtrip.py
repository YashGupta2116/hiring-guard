"""`from_state(to_state(engine))` scores identically on the next batch.

A named Phase 5 exit criterion. Phase 5 was cut, so nothing exercised it and
the gap was real: `to_state()` carried the channel accumulators, flags,
windows, score and RNG, but not the calibration state. A session serialised
mid-window resumed with an empty `BaselineBuilder`, so it rebuilt the
candidate's baseline from only the observations that arrived after the resume,
and one serialised after the window closed re-opened and re-closed it.

The mid-window case is the one that mattered and the one these tests lead
with: it is also the likeliest, since the calibration window is the first 60 s
of every session and a serverless invocation boundary can land anywhere.
"""

from __future__ import annotations

import json

import pytest

from vtml.config import STANDARD
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Observation, Source


def _obs(
    seq: int,
    t_ms: int,
    channel: Channel,
    type_: str,
    *,
    duration_ms: int | None = 2_000,
    confidence: float = 0.6,
    features: dict[str, float] | None = None,
) -> Observation:
    return Observation(
        seq=seq,
        t_ms=t_ms,
        channel=channel,
        type=type_,
        confidence=confidence,
        duration_ms=duration_ms,
        features=features or {},
        detector=f"synthetic.{channel.value}@1.0.0",
        source=Source.SYNTHETIC,
    )


def _gaze(seq: int, t_ms: int, yaw: float = 4.0) -> Observation:
    return _obs(
        seq,
        t_ms,
        Channel.GAZE,
        "gaze.offscreen_glance",
        duration_ms=500,
        confidence=0.25,
        features={"yaw_deg": yaw, "pitch_deg": 1.0},
    )


def _keystrokes(start_seq: int, start_t_ms: int, n: int) -> list[Observation]:
    return [
        _obs(
            start_seq + i,
            start_t_ms + i * 400,
            Channel.INPUT,
            "input.rhythm_shift",
            duration_ms=300,
            features={"interval_ms": 200.0 + i, "chars_per_sec": 4.0},
        )
        for i in range(n)
    ]


def _round_trip(engine: Engine) -> Engine:
    """Through JSON, not just the dict: a state that only survives in memory
    is not serialised state, and the RNG state in particular is full of numpy
    scalars that a dict comparison would let through."""
    state = json.loads(json.dumps(engine.to_state()))
    return Engine.from_state(state, STANDARD, Weights())


def _legacy_round_trip(engine: Engine) -> Engine:
    """A round trip through the state dict as it was written before the
    calibration keys existed, so a test can show what their absence cost."""
    state = engine.to_state()
    for key in ("baseline_closed", "baseline", "baseline_builder", "rhythm_window"):
        state.pop(key)
    return Engine.from_state(json.loads(json.dumps(state)), STANDARD, Weights())


def test_mid_calibration_round_trip_keeps_the_candidates_own_baseline() -> None:
    """The gap that was real, and what it cost.

    This candidate sits about 20 degrees to their camera, so their baseline
    neutral yaw is 20. The observation after the resume is a long look at 26
    degrees: 6 degrees from *their* neutral, inside the 15 degree personalised
    tolerance, so not evidence. Against the population default of 0 it is 26
    degrees away, outside the tolerance, and scores.

    Losing the baseline therefore does not merely change an internal number --
    it penalises a candidate for how they sit at their desk, which is the exact
    thing personalisation exists to prevent.
    """
    first = [_gaze(i, 5_000 + i * 6_000, yaw=20.0) for i in range(8)]
    rest = [
        _obs(
            100,
            70_000,
            Channel.GAZE,
            "gaze.persistent_offscreen",
            duration_ms=9_000,
            confidence=0.8,
            features={"yaw_deg": 26.0, "pitch_deg": 1.0},
        )
    ]

    straight = Engine(STANDARD, Weights())
    straight.ingest(first)
    straight.ingest(rest)
    expected = straight.finalise(180_000)

    resumed = Engine(STANDARD, Weights())
    resumed.ingest(first)
    resumed = _round_trip(resumed)
    resumed.ingest(rest)
    assert resumed._baseline is not None
    assert resumed._baseline.head_pose_neutral == (20.0, 1.0)
    assert resumed.finalise(180_000) == expected

    # And the same session through the old state dict, to pin what was wrong:
    # the population default replaces the candidate's own resting angle.
    legacy = Engine(STANDARD, Weights())
    legacy.ingest(first)
    legacy = _legacy_round_trip(legacy)
    legacy.ingest(rest)
    legacy_result = legacy.finalise(180_000)
    assert legacy._baseline is not None
    assert legacy._baseline.head_pose_neutral == (0.0, 0.0)
    assert expected.score is not None and legacy_result.score is not None
    assert legacy_result.score < expected.score
    assert len(legacy_result.flags) > len(expected.flags)


def test_mid_calibration_round_trip_preserves_the_builder_samples() -> None:
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 5_000 + i * 5_000) for i in range(6)])
    state = engine.to_state()

    assert state["baseline_closed"] is False
    assert state["baseline"] is None
    assert len(state["baseline_builder"]["gaze_points"]) == 6
    assert state["baseline_builder"]["glance_count"] == 6

    resumed = _round_trip(engine)
    assert resumed._baseline_builder.to_state() == engine._baseline_builder.to_state()


def test_round_trip_after_calibration_closed_does_not_reopen_it() -> None:
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 5_000 + i * 5_000) for i in range(8)])
    engine.ingest([_gaze(50, 61_000, yaw=30.0)])
    assert engine._baseline_closed

    resumed = _round_trip(engine)
    assert resumed._baseline_closed
    assert resumed._baseline == engine._baseline


def _closed_engine() -> Engine:
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 5_000 + i * 5_000) for i in range(8)])
    engine.ingest([_gaze(50, 61_000, yaw=30.0)])
    assert engine._baseline_closed
    return engine


_AFTER_CLOSE = [_obs(300, 90_000, Channel.GAZE, "gaze.persistent_offscreen", confidence=0.85)]


def test_a_closed_baseline_does_not_serialise_the_builder_samples() -> None:
    engine = _closed_engine()
    assert engine._baseline_builder._gaze_points, "the fixture must leave samples in memory to skip"

    state = engine.to_state()
    assert state["baseline_builder"] is None
    assert state["baseline"] is not None  # the closed baseline is what survives

    resumed = _round_trip(engine)
    assert resumed._baseline_closed
    assert resumed._baseline == engine._baseline


def test_round_trip_after_close_then_the_next_batch_scores_identically() -> None:
    straight = _closed_engine()
    straight.ingest(_AFTER_CLOSE)

    resumed = _round_trip(_closed_engine())
    resumed.ingest(_AFTER_CLOSE)

    assert resumed.finalise(200_000) == straight.finalise(200_000)


def test_an_older_state_that_still_carries_builder_samples_loads_and_is_ignored() -> None:
    """Payloads written before the samples were skipped are still in the wild
    (and in committed fixtures). They must load, and the extra samples must not
    change anything, because a closed baseline never reads them."""
    engine = _closed_engine()
    state = json.loads(json.dumps(engine.to_state()))
    state["baseline_builder"] = {
        "gaze_points": [[4.0, 1.0]] * 8,
        "keystroke_intervals": [],
        "glance_count": 8,
    }

    resumed = Engine.from_state(state, STANDARD, Weights())
    assert resumed._baseline_closed
    assert resumed._baseline == engine._baseline

    engine.ingest(_AFTER_CLOSE)
    resumed.ingest(_AFTER_CLOSE)
    assert resumed.finalise(200_000) == engine.finalise(200_000)


def test_round_trip_preserves_the_rhythm_window() -> None:
    """The KS test compares against a sliding 30 s window of intervals. An
    empty window after a resume made the next keystroke observation look like
    the first of the session."""
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 2_000 + i * 6_000) for i in range(10)])
    engine.ingest(_keystrokes(200, 70_000, 12))
    assert engine._rhythm_window, "the fixture must actually populate the window"

    resumed = _round_trip(engine)
    assert list(resumed._rhythm_window) == list(engine._rhythm_window)


def test_round_trip_then_the_next_batch_scores_identically() -> None:
    """Phase 5's criterion as written: the same next batch on a resumed engine
    produces the same score as on one that was never serialised."""
    warmup = [_gaze(i, 3_000 + i * 5_000) for i in range(10)]
    batch = [
        _obs(300, 90_000, Channel.GAZE, "gaze.persistent_offscreen", confidence=0.85),
        _obs(301, 93_000, Channel.SCENE, "scene.multiple_faces", confidence=0.80),
        _obs(302, 140_000, Channel.INPUT, "input.large_paste", duration_ms=None, confidence=0.9),
    ]

    straight = Engine(STANDARD, Weights())
    straight.ingest(warmup)
    straight.ingest(batch)

    resumed = Engine(STANDARD, Weights())
    resumed.ingest(warmup)
    resumed = _round_trip(resumed)
    resumed.ingest(batch)

    assert resumed.finalise(200_000) == straight.finalise(200_000)


def test_round_trip_is_byte_identical_through_json() -> None:
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 3_000 + i * 5_000) for i in range(10)])
    engine.ingest([_obs(300, 90_000, Channel.GAZE, "gaze.persistent_offscreen", confidence=0.85)])

    once = json.dumps(engine.to_state(), sort_keys=True)
    twice = json.dumps(_round_trip(engine).to_state(), sort_keys=True)
    assert once == twice


def test_a_state_without_calibration_keys_still_loads() -> None:
    """Forward compatibility runs both ways: a state dict written before these
    keys existed must load rather than raise, even though it resumes with
    calibration restarted the way it used to."""
    engine = Engine(STANDARD, Weights())
    engine.ingest([_gaze(i, 3_000 + i * 5_000) for i in range(10)])
    state = engine.to_state()
    for key in ("baseline_closed", "baseline", "baseline_builder", "rhythm_window"):
        state.pop(key)

    resumed = Engine.from_state(json.loads(json.dumps(state)), STANDARD, Weights())
    assert resumed._baseline_closed is False
    assert resumed._baseline is None
    assert list(resumed._rhythm_window) == []


@pytest.mark.parametrize("name", ["honest_clean", "honest_noisy_camera", "staged_phone_and_glance"])
def test_a_golden_fixture_split_across_a_round_trip_finalises_the_same(name: str) -> None:
    """The strongest form: split a whole golden session at its midpoint, resume
    across the boundary, and land on the committed result."""
    from vtml.fixtures import golden

    observations = sorted(golden.load(name), key=lambda o: o.t_ms)
    midpoint = golden.GOLDEN_END_MS // 2
    first = [o for o in observations if o.t_ms <= midpoint]
    rest = [o for o in observations if o.t_ms > midpoint]

    engine = Engine(STANDARD, Weights())
    engine.ingest(first)
    engine = _round_trip(engine)
    engine.ingest(rest)

    assert engine.finalise(golden.GOLDEN_END_MS) == golden.read_expected(name)
