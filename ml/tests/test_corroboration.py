"""Hand-computed corroboration boost and same-channel damping."""

import pytest

from vtml.config import STANDARD
from vtml.fusion import corroborate
from vtml.fusion.channel import ChannelState, EvidenceItem
from vtml.types import Channel


def _states_with_events(events: dict[Channel, list[int]]) -> dict[Channel, ChannelState]:
    states = {c: ChannelState(c, STANDARD) for c in Channel}
    for channel, timestamps in events.items():
        for t_ms in timestamps:
            states[channel].add(EvidenceItem(t_ms=t_ms, llr=0.5, type="test", observation_id=t_ms))
    return states


def test_two_channel_boost() -> None:
    states = _states_with_events({Channel.GAZE: [0]})
    boost, corroborating = corroborate.compute_boost(states, Channel.SCENE, 3000, STANDARD)
    assert boost == pytest.approx(1.0 + 0.45 * 1)
    assert corroborating == [Channel.GAZE]


def test_three_channel_boost_hits_the_cap() -> None:
    states = _states_with_events(
        {Channel.GAZE: [0], Channel.SCENE: [1000], Channel.FOCUS: [2000]}
    )
    boost, corroborating = corroborate.compute_boost(states, Channel.INPUT, 3000, STANDARD)
    assert boost == pytest.approx(2.35)
    assert corroborating == [Channel.FOCUS, Channel.GAZE, Channel.SCENE]


def test_boost_cap_holds_with_a_fourth_corroborating_channel() -> None:
    # AUDIO, not NETWORK, as the fourth: this test is about the cap, and a
    # zero-weight channel is no longer a corroborator at all (see below).
    states = _states_with_events(
        {
            Channel.GAZE: [0],
            Channel.SCENE: [500],
            Channel.FOCUS: [1000],
            Channel.AUDIO: [1500],
        }
    )
    boost, corroborating = corroborate.compute_boost(states, Channel.INPUT, 3000, STANDARD)
    assert len(corroborating) == 4
    # uncapped would be 1 + 0.45 * 4 = 2.8
    assert boost == pytest.approx(2.35)


def test_zero_weight_channel_cannot_corroborate() -> None:
    """PRD section 5: `network` is a data-quality note, "never a penalty to
    the candidate". Excluding it from the weighted sum is not enough -- as a
    corroborator it re-enters the score as a boost on a real channel, which
    made a dropped connection cost points and raised a flag narrated
    "corroborated by network"."""
    assert STANDARD.channel_weight[Channel.NETWORK] == 0.0
    states = _states_with_events({Channel.NETWORK: [0]})
    boost, corroborating = corroborate.compute_boost(states, Channel.SCENE, 3000, STANDARD)
    assert corroborating == []
    assert boost == pytest.approx(1.0)


def test_zero_weight_channel_does_not_count_toward_the_boost_step() -> None:
    """A weighted corroborator alongside a zero-weight one boosts exactly as
    if the zero-weight one were absent -- two channels, not three."""
    states = _states_with_events({Channel.GAZE: [0], Channel.NETWORK: [500]})
    boost, corroborating = corroborate.compute_boost(states, Channel.SCENE, 3000, STANDARD)
    assert corroborating == [Channel.GAZE]
    assert boost == pytest.approx(1.0 + 0.45 * 1)


def test_same_channel_repeat_damps_instead_of_boosting() -> None:
    states = _states_with_events({Channel.GAZE: [0]})
    boost, corroborating = corroborate.compute_boost(states, Channel.GAZE, 1000, STANDARD)
    assert boost == pytest.approx(0.6)
    assert corroborating == []


def test_outside_the_window_is_not_corroboration() -> None:
    states = _states_with_events({Channel.GAZE: [0]})
    boost, corroborating = corroborate.compute_boost(states, Channel.SCENE, 6001, STANDARD)
    assert boost == pytest.approx(1.0)
    assert corroborating == []
