"""Hand-computed expected values for the core fusion arithmetic."""

import math

import pytest

from vtml.config import STANDARD
from vtml.fusion import score
from vtml.fusion.channel import ChannelState
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Observation, Source


def _gaze_llr_for(duration_ms: int) -> float:
    engine = Engine(STANDARD, Weights())
    obs = Observation(
        seq=0,
        t_ms=0,
        channel=Channel.GAZE,
        type="gaze.offscreen_glance",
        confidence=0.5,
        duration_ms=duration_ms,
        features={},
        detector="test@1.0.0",
        source=Source.SYNTHETIC,
    )
    engine.ingest([obs])
    return engine.finalise(0).channels[Channel.GAZE]


def test_single_observation_llr_after_duration_scaling() -> None:
    # prior for gaze.offscreen_glance is 0.3 (priors.py). Duration scaling
    # is log-saturating (Rules.md section 5): scale = min(1, log1p(t/d0) /
    # log1p(d_sat/d0)), d0=1500ms, d_sat=20000ms.
    d0, d_sat = 1500, 20000
    expected_scale = math.log1p(3000 / d0) / math.log1p(d_sat / d0)
    assert _gaze_llr_for(3000) == pytest.approx(0.3 * expected_scale)


def test_duration_scaling_saturates_at_1_0() -> None:
    # 1500ms is well short of saturation. 20000ms (exactly d_sat) and
    # 60000ms (3x past it) both hit the min(1.0, ...) cap, so they scale
    # almost identically -- in fact identically, since both clamp to 1.0.
    d0, d_sat = 1500, 20000
    prior = 0.3

    def expected(duration_ms: int) -> float:
        return prior * min(1.0, math.log1p(duration_ms / d0) / math.log1p(d_sat / d0))

    llr_1500 = _gaze_llr_for(1500)
    llr_20000 = _gaze_llr_for(20000)
    llr_60000 = _gaze_llr_for(60_000)

    assert llr_1500 == pytest.approx(expected(1500))
    assert llr_20000 == pytest.approx(expected(20000))
    assert llr_60000 == pytest.approx(expected(60_000))

    assert llr_1500 < llr_20000
    assert llr_20000 == pytest.approx(llr_60000)
    assert llr_20000 == pytest.approx(prior)  # fully saturated: scale == 1.0


def test_accumulator_after_90_seconds_of_decay() -> None:
    state = ChannelState(Channel.GAZE, STANDARD)  # decay tau for gaze is 180s
    state.llr = 1.0
    state.last_update = 0
    state.decay_to(90_000)
    assert state.llr == pytest.approx(math.exp(-90 / 180))


def test_weighted_sum_and_sigmoid() -> None:
    channels = {c: ChannelState(c, STANDARD) for c in Channel}
    channels[Channel.GAZE].llr = 1.0  # gaze channel weight is 1.0, all others 0

    raw = score.weighted_sum(channels, STANDARD)
    assert raw == pytest.approx(1.0)

    expected = 100.0 / (1.0 + math.exp(1.6 * (1.0 - 2.2)))
    assert score.to_score(raw, STANDARD) == pytest.approx(expected)
