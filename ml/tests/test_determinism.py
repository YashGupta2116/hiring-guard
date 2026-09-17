"""Same input and seed produces byte-identical SessionResult, every time."""

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import generate
from vtml.fusion.engine import Engine, Weights


def test_ten_runs_produce_byte_identical_session_result() -> None:
    outputs = []
    for _ in range(10):
        observations, _ = generate("staged", seed=7)
        engine = Engine(STANDARD, Weights(), seed=7)
        engine.ingest(observations)
        result = engine.finalise(observations[-1].t_ms + 1)
        outputs.append(result.model_dump_json())

    assert len(set(outputs)) == 1
