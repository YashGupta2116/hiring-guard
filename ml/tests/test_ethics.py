"""One test per rule in Rules.md section 6. These do not get marked xfail."""

import re
from itertools import combinations

import pytest
from pydantic import ValidationError

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import generate
from vtml.fusion import narrate
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Observation, Source, Flag, SessionResult

_VERDICT_PATTERN = re.compile(r"cheat|verdict|guilty|pass|fail", re.IGNORECASE)


def test_rule1_no_verdict_field() -> None:
    for model in (SessionResult, Flag):
        schema = model.model_json_schema()
        for name, prop in schema.get("properties", {}).items():
            if prop.get("type") == "boolean":
                assert not _VERDICT_PATTERN.search(name), (
                    f"{model.__name__}.{name} looks like a verdict field"
                )


def test_rule2_absence_is_never_evidence() -> None:
    observations, _ = generate("staged", seed=7)
    session_end = observations[-1].t_ms + 1
    gap_start, gap_end = 60_000, 150_000

    engine_full = Engine(STANDARD, Weights())
    engine_full.ingest(observations)
    result_full = engine_full.finalise(session_end)

    before = [o for o in observations if o.t_ms < gap_start]
    during = [
        o for o in observations if gap_start <= o.t_ms < gap_end and o.channel != Channel.GAZE
    ]
    after = [o for o in observations if o.t_ms >= gap_end]

    engine_holed = Engine(STANDARD, Weights())
    engine_holed.ingest(before)
    engine_holed.suppress(Channel.GAZE, "test_gap")
    engine_holed.ingest(during)
    engine_holed.resume(Channel.GAZE)
    engine_holed.ingest(after)
    result_holed = engine_holed.finalise(session_end)

    assert result_full.score is not None and result_holed.score is not None
    assert result_holed.score >= result_full.score
    assert any(w.channel == Channel.GAZE for w in result_holed.unscored)


def test_rule3_flags_reconstruct_their_score_delta() -> None:
    from vtml.fusion import score as score_mod

    observations, _ = generate("staged", seed=7)
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.finalise(observations[-1].t_ms + 1)
    assert result.flags

    for flag in result.flags:
        cutoff_seq = max(flag.observation_ids)
        cutoff_t_ms = next(o.t_ms for o in observations if o.seq == cutoff_seq)
        prefix = [o for o in observations if o.seq <= cutoff_seq]

        replay = Engine(STANDARD, Weights())
        replay.ingest(prefix)
        snapshot = replay.finalise(cutoff_t_ms)

        raw_total = sum(
            STANDARD.channel_weight[c] * llr for c, llr in snapshot.channels.items()
        )
        raw_without = raw_total - STANDARD.channel_weight[flag.channel] * flag.llr
        expected_delta = snapshot.score - score_mod.to_score(raw_without, STANDARD)
        assert flag.score_delta == pytest.approx(expected_delta, abs=1e-9)


def test_rule4_narratives_never_use_banned_words() -> None:
    for type_, template in narrate.TEMPLATES.items():
        lowered = template.lower()
        for word in narrate.BANNED_WORDS:
            assert word not in lowered, f"{type_} template contains banned word {word!r}"


def test_rule5_no_text_enters_the_engine() -> None:
    with pytest.raises(ValidationError):
        Observation(
            seq=0,
            t_ms=0,
            channel=Channel.GAZE,
            type="gaze.offscreen_glance",
            confidence=0.5,
            duration_ms=100,
            features={"transcript": "hello"},
            detector="test@1.0.0",
            source=Source.SYNTHETIC,
        )


def test_rule6_output_always_carries_its_caveats() -> None:
    observations, _ = generate("honest", seed=7)
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    result = engine.finalise(observations[-1].t_ms + 1)

    assert result.weights_version
    assert result.calibration in ("complete", "fallback")
    assert result.unscored == []  # clean session, but the field is present either way


def test_rule7_dismissal_only_ever_raises_the_score() -> None:
    observations, _ = generate("staged", seed=7)
    engine = Engine(STANDARD, Weights())
    engine.ingest(observations)
    original = engine.finalise(observations[-1].t_ms + 1)
    flag_ids = [f.id for f in original.flags]
    assert flag_ids

    for size in range(len(flag_ids) + 1):
        for subset in combinations(flag_ids, size):
            recomputed = engine.recompute(dismissed_ids=list(subset))
            assert recomputed.score >= original.score - 1e-9
