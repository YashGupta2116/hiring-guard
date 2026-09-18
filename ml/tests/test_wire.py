"""Tests for wire.py: the engine channel -> backend MonitoringChannel
mapping, and that it is total over the registry (task 6)."""

from __future__ import annotations

from vtml import wire
from vtml.detectors.schema import REGISTRY, DetectorType
from vtml.types import Channel, Observation, Source

_BACKEND_ENUM = {
    "GAZE",
    "FACE",
    "IDENTITY",
    "SCENE",
    "AUDIO",
    "SCREEN",
    "FOCUS",
    "PASTE",
    "RHYTHM",
    "POINTER",
    "ENVIRONMENT",
}

# The two channels the engine deliberately never puts on the wire.
_DELIBERATELY_ABSENT = {Channel.NETWORK, Channel.AUDIO}


def _obs(type_: str, channel: Channel, **overrides: object) -> Observation:
    base: dict[str, object] = dict(
        seq=1,
        t_ms=1000,
        channel=channel,
        type=type_,
        confidence=0.8,
        duration_ms=500,
        features={},
        detector="test@1.0.0",
        source=Source.SYNTHETIC,
    )
    base.update(overrides)
    return Observation(**base)  # type: ignore[arg-type]


def test_mapping_is_total_over_the_registry() -> None:
    for type_, spec in REGISTRY.items():
        if spec.channel in _DELIBERATELY_ABSENT:
            assert spec.wire_channel is None, type_
        else:
            assert spec.wire_channel in _BACKEND_ENUM, type_


def test_gaze_scene_focus_map_one_to_one() -> None:
    assert wire.wire_channel_for(DetectorType.GAZE_OFFSCREEN_GLANCE.value) == "GAZE"
    assert wire.wire_channel_for(DetectorType.SCENE_FACE_ABSENT.value) == "SCENE"
    assert wire.wire_channel_for(DetectorType.FOCUS_TAB_HIDDEN.value) == "FOCUS"


def test_input_splits_by_detector_type() -> None:
    assert wire.wire_channel_for(DetectorType.INPUT_LARGE_PASTE.value) == "PASTE"
    assert wire.wire_channel_for(DetectorType.INPUT_LOW_TYPED_RATIO.value) == "PASTE"
    assert wire.wire_channel_for(DetectorType.INPUT_BURST_RATE.value) == "RHYTHM"
    assert wire.wire_channel_for(DetectorType.INPUT_RHYTHM_SHIFT.value) == "RHYTHM"


def test_network_becomes_an_unscored_window_with_signal_loss() -> None:
    obs = _obs(DetectorType.NETWORK_TELEMETRY_GAP.value, Channel.NETWORK, t_ms=4200)
    result = wire.dispatch(obs)
    assert result is not None and not isinstance(result, tuple)
    assert result.channel == Channel.NETWORK
    assert result.reason == wire.SIGNAL_LOSS
    assert result.t_start_ms == 4200


def test_audio_never_reaches_the_wire() -> None:
    obs = _obs(DetectorType.AUDIO_SECOND_VOICE.value, Channel.AUDIO)
    assert wire.dispatch(obs) is None


def test_duration_ms_travels_inside_payload() -> None:
    obs = _obs(DetectorType.INPUT_LARGE_PASTE.value, Channel.INPUT, duration_ms=None)
    result = wire.dispatch(obs)
    assert isinstance(result, tuple)
    channel, payload = result
    assert channel == "PASTE"
    assert payload["duration_ms"] is None
