"""A suppressed channel neither accumulates nor decays, and the window
it opens appears in the bookkeeping list until resumed."""

from vtml.config import STANDARD
from vtml.fusion import windows
from vtml.fusion.channel import ChannelState, EvidenceItem
from vtml.types import Channel, UnscoredWindow


def test_suppressed_channel_neither_accumulates_nor_decays() -> None:
    states = {c: ChannelState(c, STANDARD) for c in Channel}
    state = states[Channel.GAZE]
    state.llr = 1.0
    state.last_update = 0

    window_list: list[UnscoredWindow] = []
    windows.suppress(window_list, states, Channel.GAZE, "camera_dropped", 1000)

    assert state.suppressed is True
    llr_before = state.llr

    state.decay_to(90_000)
    state.add(EvidenceItem(t_ms=90_000, llr=5.0, type="gaze.offscreen_glance", observation_id=0))

    assert state.llr == llr_before
    assert len(state.recent) == 0


def test_window_opens_then_closes_on_resume() -> None:
    states = {c: ChannelState(c, STANDARD) for c in Channel}
    window_list: list[UnscoredWindow] = []

    windows.suppress(window_list, states, Channel.SCENE, "camera_dropped", 1000)
    assert len(window_list) == 1
    assert window_list[0].t_start_ms == 1000
    assert window_list[0].t_end_ms is None
    assert window_list[0].reason == "camera_dropped"

    windows.resume(window_list, states, Channel.SCENE, 31_000)
    assert window_list[0].t_end_ms == 31_000
    assert states[Channel.SCENE].suppressed is False


def test_close_all_closes_any_still_open_window() -> None:
    window_list = [UnscoredWindow(channel=Channel.INPUT, reason="x", t_start_ms=0, t_end_ms=None)]
    windows.close_all(window_list, 5000)
    assert window_list[0].t_end_ms == 5000
