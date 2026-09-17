"""Unscored window bookkeeping: open, close, and the freeze rule that
keeps a suppressed channel from moving in either direction while blind.
"""

from __future__ import annotations

from vtml.fusion.channel import ChannelState
from vtml.types import Channel, UnscoredWindow


def suppress(
    windows: list[UnscoredWindow],
    channel_states: dict[Channel, ChannelState],
    channel: Channel,
    reason: str,
    t_ms: int,
) -> None:
    state = channel_states[channel]
    state.decay_to(t_ms)  # settle evidence up to the moment it goes blind
    state.suppressed = True
    windows.append(UnscoredWindow(channel=channel, reason=reason, t_start_ms=t_ms, t_end_ms=None))


def resume(
    windows: list[UnscoredWindow],
    channel_states: dict[Channel, ChannelState],
    channel: Channel,
    t_ms: int,
) -> None:
    state = channel_states[channel]
    state.suppressed = False
    state.last_update = t_ms  # no retroactive decay across the blind interval
    for window in reversed(windows):
        if window.channel == channel and window.t_end_ms is None:
            window.t_end_ms = t_ms
            break


def close_all(windows: list[UnscoredWindow], t_ms: int) -> None:
    for window in windows:
        if window.t_end_ms is None:
            window.t_end_ms = t_ms
