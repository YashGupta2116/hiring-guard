"""Threshold crossing, severity cuts, corroboration escalation, merge span,
and leave-one-out score_delta -- all hand-computed."""

import math

import pytest

from vtml.config import STANDARD
from vtml.fusion import flags, score
from vtml.fusion.channel import ChannelState, EvidenceItem
from vtml.types import Channel, Flag, Severity


def _channel_states_with(channel: Channel, llr: float) -> dict[Channel, ChannelState]:
    states = {c: ChannelState(c, STANDARD) for c in Channel}
    states[channel].llr = llr
    return states


def test_severity_low_below_threshold() -> None:
    assert flags.severity_for(1.0, [], STANDARD) == Severity.LOW


def test_severity_medium_at_low_boundary() -> None:
    assert flags.severity_for(1.5, [], STANDARD) == Severity.MEDIUM


def test_severity_high_at_medium_boundary() -> None:
    assert flags.severity_for(3.0, [], STANDARD) == Severity.HIGH


def test_severity_raised_one_tier_by_two_channel_corroboration() -> None:
    assert flags.severity_for(1.0, [Channel.SCENE, Channel.FOCUS], STANDARD) == Severity.MEDIUM


def test_severity_capped_at_high() -> None:
    assert flags.severity_for(3.0, [Channel.SCENE, Channel.FOCUS], STANDARD) == Severity.HIGH


def test_threshold_crossing_emits_a_flag() -> None:
    states = _channel_states_with(Channel.GAZE, 0.8)
    evidence = EvidenceItem(t_ms=0, llr=0.8, type="gaze.offscreen_glance", observation_id=0)
    flag_list: list[Flag] = []
    flag = flags.emit_or_merge(
        flag_list, states, STANDARD, evidence, Channel.GAZE, [], 90.0, "narrative", 0, "flag-1"
    )
    assert flag is not None
    assert flag_list == [flag]


def test_below_threshold_emits_nothing() -> None:
    states = _channel_states_with(Channel.GAZE, 0.5)
    evidence = EvidenceItem(t_ms=0, llr=0.5, type="gaze.offscreen_glance", observation_id=0)
    flag_list: list[Flag] = []
    flag = flags.emit_or_merge(
        flag_list, states, STANDARD, evidence, Channel.GAZE, [], 90.0, "narrative", 0, "flag-1"
    )
    assert flag is None
    assert flag_list == []


def test_merge_extends_existing_flag_span_instead_of_creating_a_new_one() -> None:
    states = _channel_states_with(Channel.GAZE, 2.0)
    flag_list: list[Flag] = []

    first = EvidenceItem(t_ms=0, llr=1.0, type="gaze.persistent_offscreen", observation_id=0)
    flags.emit_or_merge(
        flag_list, states, STANDARD, first, Channel.GAZE, [], 90.0, "first", 0, "flag-1"
    )
    second = EvidenceItem(t_ms=5000, llr=1.0, type="gaze.persistent_offscreen", observation_id=1)
    flags.emit_or_merge(
        flag_list, states, STANDARD, second, Channel.GAZE, [], 90.0, "second", 5000, "flag-2"
    )

    assert len(flag_list) == 1
    merged = flag_list[0]
    assert merged.id == "flag-1"
    assert merged.t_start_ms == 0
    assert merged.t_end_ms == 5000
    assert merged.llr == pytest.approx(2.0)
    assert merged.observation_ids == [0, 1]


def test_merge_outside_window_creates_a_new_flag() -> None:
    states = _channel_states_with(Channel.GAZE, 2.0)
    flag_list: list[Flag] = []

    first = EvidenceItem(t_ms=0, llr=1.0, type="gaze.persistent_offscreen", observation_id=0)
    flags.emit_or_merge(
        flag_list, states, STANDARD, first, Channel.GAZE, [], 90.0, "first", 0, "flag-1"
    )
    later = EvidenceItem(t_ms=20_000, llr=1.0, type="gaze.persistent_offscreen", observation_id=1)
    flags.emit_or_merge(
        flag_list, states, STANDARD, later, Channel.GAZE, [], 90.0, "later", 20_000, "flag-2"
    )

    assert len(flag_list) == 2


def test_score_delta_matches_hand_computed_leave_one_out() -> None:
    states = _channel_states_with(Channel.GAZE, 1.0)
    raw = score.weighted_sum(states, STANDARD)
    current_score = score.to_score(raw, STANDARD)

    delta = flags.score_delta_for(states, Channel.GAZE, 1.0, STANDARD, current_score)

    expected_current = 100.0 / (1.0 + math.exp(1.6 * (1.0 - 2.2)))
    expected_without = 100.0 / (1.0 + math.exp(1.6 * (0.0 - 2.2)))
    assert current_score == pytest.approx(expected_current)
    assert delta == pytest.approx(expected_current - expected_without)
