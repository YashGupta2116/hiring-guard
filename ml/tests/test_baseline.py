"""Tests for baseline.py: BaselineBuilder sufficiency, the KS test, and
the Engine-level personalised threshold behaviour it drives (task 4).
"""

from __future__ import annotations

from vtml.baseline import BaselineBuilder, ks_2samp
from vtml.config import EngineConfig
from vtml.detectors.schema import DetectorType
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Observation, Source

_CONFIG = EngineConfig()


def _gaze_obs(seq: int, t_ms: int, yaw: float, pitch: float = 0.0, duration_ms: int = 8000) -> Observation:
    return Observation(
        seq=seq,
        t_ms=t_ms,
        channel=Channel.GAZE,
        type=DetectorType.GAZE_PERSISTENT_OFFSCREEN,
        confidence=0.9,
        duration_ms=duration_ms,
        features={"yaw_deg": yaw, "pitch_deg": pitch},
        detector="test.gaze@1.0.0",
        source=Source.SYNTHETIC,
    )


def test_60s_stream_produces_a_complete_baseline() -> None:
    builder = BaselineBuilder(_CONFIG)
    for i, yaw in enumerate((-2.0, 0.0, 2.0, -1.0, 1.0)):
        builder.observe(_gaze_obs(i, i * 1000, yaw))
    baseline = builder.finalise(60_000)
    assert baseline.fallback is False
    assert baseline.head_pose_neutral == (0.0, 0.0)


def test_20s_stream_produces_a_fallback_baseline() -> None:
    builder = BaselineBuilder(_CONFIG)
    builder.observe(_gaze_obs(0, 1000, 0.0))
    baseline = builder.finalise(20_000)
    assert baseline.fallback is True


def test_too_few_gaze_samples_uses_population_default_even_past_the_window() -> None:
    builder = BaselineBuilder(_CONFIG)
    # Only 2 samples, below baseline_min_gaze_samples (5), but the window
    # itself ran its full course -- fallback stays False, only the gaze
    # field itself defaults.
    builder.observe(_gaze_obs(0, 1000, 40.0))
    builder.observe(_gaze_obs(1, 2000, 42.0))
    baseline = builder.finalise(60_000)
    assert baseline.fallback is False
    assert baseline.head_pose_neutral == (0.0, 0.0)  # population default, not 41.0


def test_ks_identical_distributions_low_d_high_p() -> None:
    sample = [80.0, 90.0, 100.0, 110.0, 120.0, 95.0, 105.0]
    d, p = ks_2samp(sample, sample)
    assert d == 0.0
    assert p == 1.0


def test_ks_very_different_distributions_high_d_low_p() -> None:
    baseline_sample = [80.0, 85.0, 90.0, 95.0, 100.0, 88.0, 92.0, 84.0]
    burst_sample = [20.0, 22.0, 18.0, 21.0, 19.0, 23.0, 20.0, 17.0]
    d, p = ks_2samp(baseline_sample, burst_sample)
    assert d > 0.9
    assert p < 0.01


def test_same_gaze_stream_against_two_baselines_gives_different_flag_counts() -> None:
    # Engine A calibrates around a neutral yaw of ~0 degrees; Engine B
    # around ~30 degrees (a candidate sitting at an angle to the camera).
    calibration_a = [_gaze_obs(i, i * 1000, yaw) for i, yaw in enumerate((-2.0, 0.0, 2.0, -1.0, 1.0))]
    calibration_b = [
        _gaze_obs(100 + i, i * 1000, yaw) for i, yaw in enumerate((28.0, 30.0, 32.0, 29.0, 31.0))
    ]

    # Same steady-state stream for both: a persistent offscreen glance at
    # yaw=30, well past the 60 s calibration window.
    steady_state = [_gaze_obs(200, 61_000, yaw=30.0, duration_ms=8000)]

    engine_a = Engine(_CONFIG, Weights())
    engine_a.ingest(calibration_a)
    engine_a.ingest(steady_state)
    result_a = engine_a.finalise(70_000)

    engine_b = Engine(_CONFIG, Weights())
    engine_b.ingest(calibration_b)
    engine_b.ingest(steady_state)
    result_b = engine_b.finalise(70_000)

    assert len(result_a.flags) != len(result_b.flags)
    # A's baseline is dead ahead, so yaw=30 is genuinely off-screen.
    assert len(result_a.flags) > len(result_b.flags)


def test_calibration_window_suppresses_flags_but_still_records_evidence() -> None:
    # A persistent_offscreen event well within the flag-threshold LLR
    # range, but entirely inside the 60 s calibration window: no flag,
    # even though the same event past the window would flag (per the
    # test above).
    observations = [_gaze_obs(0, 5_000, yaw=90.0, duration_ms=8000)]
    engine = Engine(_CONFIG, Weights())
    engine.ingest(observations)
    result = engine.finalise(59_000)
    assert result.flags == []
    # Evidence still accumulated: the gaze channel is non-zero.
    assert result.channels[Channel.GAZE] != 0.0
