import pytest
from pydantic import ValidationError

from vtml.types import Channel, Observation, Source


def _base_kwargs(**overrides: object) -> dict:
    kwargs: dict = dict(
        seq=0,
        t_ms=0,
        channel=Channel.GAZE,
        type="gaze.offscreen_glance",
        confidence=0.5,
        duration_ms=500,
        features={},
        detector="test@1.0.0",
        source=Source.SYNTHETIC,
    )
    kwargs.update(overrides)
    return kwargs


def test_observation_accepts_float_features() -> None:
    obs = Observation(**_base_kwargs(features={"yaw_deg": 12.5, "count": 2}))
    assert obs.features == {"yaw_deg": 12.5, "count": 2.0}


def test_observation_rejects_string_feature_value() -> None:
    with pytest.raises(ValidationError):
        Observation(**_base_kwargs(features={"transcript": "not a float"}))


def test_observation_rejects_bool_feature_value() -> None:
    with pytest.raises(ValidationError):
        Observation(**_base_kwargs(features={"flag": True}))
