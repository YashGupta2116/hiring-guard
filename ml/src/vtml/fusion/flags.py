"""Flag emission, merging, severity, and leave-one-out score_delta."""

from __future__ import annotations

from vtml.config import EngineConfig
from vtml.fusion import score as score_mod
from vtml.fusion.channel import ChannelState, EvidenceItem
from vtml.types import Channel, Flag, Severity

_TIERS = (Severity.LOW, Severity.MEDIUM, Severity.HIGH)


def severity_for(llr: float, corroborated_by: list[Channel], config: EngineConfig) -> Severity:
    if llr < config.severity_low_max:
        tier = 0
    elif llr < config.severity_medium_max:
        tier = 1
    else:
        tier = 2
    if len(corroborated_by) >= 2:
        tier = min(tier + 1, 2)
    return _TIERS[tier]


def score_delta_for(
    channel_states: dict[Channel, ChannelState],
    channel: Channel,
    flag_llr_total: float,
    config: EngineConfig,
    current_score: float,
) -> float:
    """current_score minus what the score would be with this flag's total
    evidence removed from its channel -- the exact points it cost."""
    without_raw = score_mod.weighted_sum(channel_states, config) - (
        config.channel_weight[channel] * flag_llr_total
    )
    without_score = score_mod.to_score(without_raw, config)
    return current_score - without_score


def _find_mergeable(
    flags: list[Flag], channel: Channel, type_: str, t_ms: int, config: EngineConfig
) -> Flag | None:
    for flag in reversed(flags):
        if (
            flag.channel == channel
            and flag.type == type_
            and t_ms - flag.t_end_ms <= config.merge_window_ms
        ):
            return flag
    return None


def emit_or_merge(
    flags: list[Flag],
    channel_states: dict[Channel, ChannelState],
    config: EngineConfig,
    evidence: EvidenceItem,
    channel: Channel,
    corroborated_by: list[Channel],
    current_score: float,
    narrative: str,
    media_offset_ms: int,
    new_flag_id: str,
) -> Flag | None:
    if evidence.llr < config.flag_threshold:
        return None

    existing = _find_mergeable(flags, channel, evidence.type, evidence.t_ms, config)
    if existing is not None:
        total_llr = existing.llr + evidence.llr
        merged_corroborated = sorted(
            {*existing.corroborated_by, *corroborated_by}, key=lambda c: c.value
        )
        existing.t_end_ms = evidence.t_ms
        existing.llr = total_llr
        existing.corroborated_by = merged_corroborated
        existing.observation_ids = [*existing.observation_ids, evidence.observation_id]
        existing.severity = severity_for(total_llr, merged_corroborated, config)
        existing.score_delta = score_delta_for(
            channel_states, channel, total_llr, config, current_score
        )
        existing.narrative = narrative
        return existing

    severity = severity_for(evidence.llr, corroborated_by, config)
    delta = score_delta_for(channel_states, channel, evidence.llr, config, current_score)
    flag = Flag(
        id=new_flag_id,
        t_start_ms=evidence.t_ms,
        t_end_ms=evidence.t_ms,
        channel=channel,
        type=evidence.type,
        severity=severity,
        llr=evidence.llr,
        score_delta=delta,
        corroborated_by=corroborated_by,
        observation_ids=[evidence.observation_id],
        narrative=narrative,
        media_offset_ms=media_offset_ms,
    )
    flags.append(flag)
    return flag
