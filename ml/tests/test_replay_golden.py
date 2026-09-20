"""The golden fixtures from Rules.md section 8.

Two kinds of assertion live here and they fail for different reasons:

- The committed-`SessionResult` comparison is a *regression* check. It fails
  whenever any fusion constant moves, on purpose -- regenerate with
  `python -m vtml.fixtures.golden` and review the diff.
- The named requirements (honest sessions above 85, no high-severity flags on
  an honest session, the staged session suppressed) are *behavioural*. These
  do not get regenerated away: if one fails, the false-positive behaviour is
  broken regardless of what the other numbers say.
"""

import pytest

from vtml.config import STANDARD
from vtml.fixtures import golden
from vtml.types import Severity

_HONEST = ("honest_clean", "honest_noisy_camera")


@pytest.mark.parametrize("name", golden.GOLDEN_NAMES)
def test_golden_replays_to_its_committed_result(name: str) -> None:
    assert golden.replay(name) == golden.read_expected(name)


@pytest.mark.parametrize("name", golden.GOLDEN_NAMES)
def test_golden_replay_is_deterministic(name: str) -> None:
    assert golden.replay(name) == golden.replay(name)


@pytest.mark.parametrize("name", _HONEST)
def test_honest_golden_scores_in_the_clear_band(name: str) -> None:
    """Rules.md section 8: `honest_noisy_camera` is the most important test in
    the repo. A session with a bad webcam, poor lighting and a dropped
    connection must score above 85 -- equipment quality is not evidence."""
    result = golden.replay(name)
    assert result.score is not None
    assert result.score > STANDARD.band_clear_min, f"{name} scored {result.score:.2f}"
    assert result.band == "clear"


@pytest.mark.parametrize("name", _HONEST)
def test_honest_golden_raises_no_high_severity_flag(name: str) -> None:
    assert [f for f in golden.replay(name).flags if f.severity is Severity.HIGH] == []


def test_dropped_connection_costs_the_honest_session_nothing() -> None:
    """PRD section 5: `network` never penalises the candidate. The noisy
    fixture carries real telemetry gaps, so replaying it without them must
    land on the identical score, not merely a similar one."""
    full = golden.replay("honest_noisy_camera")
    observations = [o for o in golden.load("honest_noisy_camera") if o.channel.value != "network"]

    from vtml.fusion.engine import Engine, Weights

    engine = Engine(STANDARD, Weights())
    engine.ingest(sorted(observations, key=lambda o: o.t_ms))
    without = engine.finalise(golden.GOLDEN_END_MS)

    assert full.score == pytest.approx(without.score)
    assert len(full.flags) == len(without.flags)


def test_staged_golden_is_suppressed_and_flagged() -> None:
    result = golden.replay("staged_phone_and_glance")
    assert result.score is not None
    assert result.score < STANDARD.band_review_min
    assert result.band == "suppressed"
    assert result.flags, "the staged session must raise at least one flag"


def test_staged_golden_flags_the_scripted_events_not_the_ambient_glance() -> None:
    """The lone early glance is the ambiguous signal (PRD section 2) and must
    not flag on its own; the phone -- gaze held on a fixed external point --
    and the paste are what the session is for."""
    flagged = {f.type for f in golden.replay("staged_phone_and_glance").flags}
    assert "gaze.fixed_external_focus" in flagged
    assert "input.large_paste" in flagged
    assert "gaze.offscreen_glance" not in flagged
