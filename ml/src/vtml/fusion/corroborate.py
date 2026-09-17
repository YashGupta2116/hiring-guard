"""Corroboration: the boost for independent channels agreeing inside a
short window, and the damping for the same channel repeating itself.

These are mutually exclusive per incoming item (Rules.md section 5):
a same-channel repeat inside the window damps instead of boosting.
"""

from __future__ import annotations

from vtml.config import EngineConfig
from vtml.fusion.channel import ChannelState
from vtml.types import Channel


def compute_boost(
    channel_states: dict[Channel, ChannelState],
    incoming_channel: Channel,
    t_ms: int,
    config: EngineConfig,
) -> tuple[float, list[Channel]]:
    window_start = t_ms - config.corroboration_window_ms

    # <= on both ends: this runs before the incoming evidence is added to
    # its own channel, so there's no self-match to exclude, and a
    # same-instant event on another channel is still inside the window.
    own_recent = channel_states[incoming_channel].recent
    if any(window_start <= item.t_ms <= t_ms for item in own_recent):
        return config.same_channel_damping, []

    corroborating = sorted(
        (
            channel
            for channel, state in channel_states.items()
            if channel != incoming_channel
            and any(window_start <= item.t_ms <= t_ms for item in state.recent)
        ),
        key=lambda c: c.value,
    )
    n_channels = 1 + len(corroborating)
    boost = min(
        1.0 + config.corroboration_boost_step * (n_channels - 1),
        config.corroboration_boost_cap,
    )
    return boost, corroborating
