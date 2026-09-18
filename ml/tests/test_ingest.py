"""Tests for ingest.normalise(): validation, clock correction, dedup,
the 2 s reorder buffer, and the clock-anomaly path.
"""

from __future__ import annotations

from typing import Any

from vtml import ingest
from vtml.detectors.schema import DetectorType


def _raw(seq: int, t_ms: int, **overrides: Any) -> dict[str, object]:
    base: dict[str, object] = {
        "seq": seq,
        "t_ms": t_ms,
        "channel": "gaze",
        "type": DetectorType.GAZE_OFFSCREEN_GLANCE.value,
        "confidence": 0.5,
        "duration_ms": 300,
        "features": {},
        "detector": "mp.gaze@1.0.0",
        "source": "browser",
    }
    base.update(overrides)
    return base


def test_valid_batch_all_accepted() -> None:
    raw = [_raw(0, 1000), _raw(1, 2000)]
    observations, result = ingest.normalise(raw, received_at_ms=2000)
    assert result.accepted == 2
    assert result.dropped == 0
    assert [o.seq for o in observations] == [0, 1]


def test_invalid_observation_is_dropped_and_counted_never_raises() -> None:
    raw = [_raw(0, 1000), {"seq": 1, "t_ms": "not-an-int", "detector": "bad@1.0.0"}]
    observations, result = ingest.normalise(raw, received_at_ms=1000)
    assert result.dropped_invalid == 1
    assert result.accepted == 1
    assert [o.seq for o in observations] == [0]


def test_clock_offset_applied_session_relative() -> None:
    observations, _ = ingest.normalise([_raw(0, 1000)], received_at_ms=1500, clock_offset_ms=500)
    assert observations[0].t_ms == 1500


def test_duplicate_source_seq_dropped_and_counted() -> None:
    raw = [_raw(0, 1000), _raw(0, 1000)]
    observations, result = ingest.normalise(raw, received_at_ms=1000)
    assert result.dropped_duplicate == 1
    assert len(observations) == 1


def test_same_seq_different_source_is_not_a_duplicate() -> None:
    raw = [_raw(0, 1000, source="browser"), _raw(0, 1000, source="synthetic")]
    _, result = ingest.normalise(raw, received_at_ms=1000)
    assert result.dropped_duplicate == 0


def test_out_of_order_within_buffer_is_reordered_not_dropped() -> None:
    raw = [_raw(0, 5000), _raw(1, 4000)]  # 1 s behind the watermark
    observations, result = ingest.normalise(raw, received_at_ms=5000)
    assert result.reordered == 1
    assert result.late_beyond_buffer == 0
    assert [o.seq for o in observations] == [1, 0]  # emitted in time order


def test_out_of_order_beyond_buffer_is_accepted_with_a_warning() -> None:
    raw = [_raw(0, 10_000), _raw(1, 5_000)]  # 5 s behind the watermark
    observations, result = ingest.normalise(raw, received_at_ms=10_000)
    assert result.reordered == 1
    assert result.late_beyond_buffer == 1
    assert result.dropped == 0  # late is accepted, never dropped
    assert [o.seq for o in observations] == [1, 0]


def test_clock_anomaly_emits_zero_weight_network_observation() -> None:
    # Corrected t_ms is 9 s from receipt -- over the 5 s bound.
    raw = [_raw(0, 1000, channel="gaze", type=DetectorType.GAZE_PERSISTENT_OFFSCREEN.value)]
    observations, result = ingest.normalise(raw, received_at_ms=10_000)
    assert result.clock_anomaly == 1
    assert len(observations) == 1
    assert observations[0].type == DetectorType.NETWORK_CLOCK_ANOMALY.value
    assert observations[0].channel.value == "network"
    # The original gaze evidence never reaches the engine under this type.
    assert observations[0].type != DetectorType.GAZE_PERSISTENT_OFFSCREEN.value


def test_unknown_detector_type_dropped_and_counted() -> None:
    raw = [_raw(0, 1000, type="gaze.unheard_of")]
    observations, result = ingest.normalise(raw, received_at_ms=1000)
    assert result.unknown_detector == 1
    assert observations == []
