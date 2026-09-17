"""Weighted sum across channels, sigmoid to 0-100, band mapping.

Score is an integrity *confidence*: accumulated evidence of irregular
behaviour should push it down, not up, so this sigmoid is the mirror
image of a standard logistic curve. Sigmoid is `1 / (1 + np.exp(x))`
per Rules.md section 3 -- no scipy at runtime, and np.exp saturates to
inf/0 on overflow instead of raising, which is what the finite-value
guard below needs.
"""

from __future__ import annotations

import logging
import math
from typing import Literal

import numpy as np

from vtml.config import EngineConfig
from vtml.fusion.channel import ChannelState
from vtml.types import Channel

logger = logging.getLogger(__name__)

Band = Literal["clear", "review", "suppressed"]


def weighted_sum(channel_states: dict[Channel, ChannelState], config: EngineConfig) -> float:
    return sum(
        config.channel_weight[channel] * state.llr for channel, state in channel_states.items()
    )


def to_score(raw: float, config: EngineConfig) -> float:
    x = config.score_slope * (raw - config.score_midpoint)
    with np.errstate(over="ignore"):
        denom = 1.0 + np.exp(x)
    return float(config.score_scale / denom)


def to_band(score: float, config: EngineConfig) -> Band:
    if score >= config.band_clear_min:
        return "clear"
    if score >= config.band_review_min:
        return "review"
    return "suppressed"


def safe_score(
    channel_states: dict[Channel, ChannelState],
    config: EngineConfig,
    previous_score: float,
) -> tuple[float, bool]:
    """Returns (score, degraded). Never returns a non-finite score."""
    raw = weighted_sum(channel_states, config)
    score = to_score(raw, config)
    if not math.isfinite(score):
        logger.error(
            "non-finite score (raw=%s); reverting to previous. accumulators=%s",
            raw,
            {c.value: s.llr for c, s in channel_states.items()},
        )
        return previous_score, True
    return score, False
