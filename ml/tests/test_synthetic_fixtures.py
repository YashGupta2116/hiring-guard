"""Phase 1 exit criteria against the synthetic generator's own output:
a staged session must produce a medium flag, an honest one must produce
no high flag.
"""

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import generate
from vtml.fusion.engine import Engine, Weights
from vtml.types import Severity


def test_staged_session_emits_at_least_one_medium_flag() -> None:
    observations, _ = generate("staged", seed=7)
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.finalise(observations[-1].t_ms + 1)

    assert any(flag.severity == Severity.MEDIUM for flag in result.flags)


def test_honest_session_emits_no_high_flag() -> None:
    observations, _ = generate("honest", seed=7)
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.finalise(observations[-1].t_ms + 1)

    assert all(flag.severity != Severity.HIGH for flag in result.flags)
