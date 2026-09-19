"""Calibration-window ablation.

Reproduces, by running both conditions rather than citing the changelog,
the score difference `docs/Memory.md`'s 2026-09-18 entry already
describes: whether observations inside the first `calibration_window_s`
of a session accumulate LLR (the prior defect) or are discarded outright
except for feeding `BaselineBuilder` (the shipped fix).

Condition A, shipped: `fusion.engine.Engine`, unmodified -- no override
needed, since this is just the default engine.

Condition B, the prior defect: `_CalibrationLeakEngine` below, a
temporary, evaluation-only subclass. It duplicates `Engine._process_one`'s
control flow with exactly one line removed (the calibration-window early
return) and one condition added (flag emission still checks `calibrating`,
which the real defect never touched) -- every formula it uses (duration
scaling, personalisation, corroboration, scoring) is the inherited method,
called through `self`, never re-derived. This class is never imported
outside this module and is not a config flag on the shipped `Engine`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from vtml.config import STANDARD, EngineConfig
from vtml.evaluate.metrics import load_observations
from vtml.fusion import corroborate
from vtml.fusion import flags as flags_mod
from vtml.fusion import narrate as narrate_mod
from vtml.fusion import score as score_mod
from vtml.fusion.channel import EvidenceItem
from vtml.fusion.engine import Engine, Weights
from vtml.types import Observation

_ML_ROOT = Path(__file__).resolve().parents[3]
_FIXTURE_DIR = _ML_ROOT / "fixtures" / "synthetic"


class _CalibrationLeakEngine(Engine):
    """Condition B: an in-window observation accumulates LLR, enters
    `state.recent`, and is eligible for corroboration; only flag emission
    stays gated. See module docstring."""

    def _process_one(self, obs: Observation) -> bool:
        if obs.seq in self._seen_seq:
            self._bump("dropped_duplicate")
            return False
        self._seen_seq.add(obs.seq)

        channel = obs.channel
        state = self._channels[channel]
        if state.suppressed:
            self._bump("dropped_suppressed")
            return False

        for other in self._channels.values():
            other.decay_to(obs.t_ms)

        prior = self._priors.get(obs.type)
        if prior is None:
            self._bump("unknown_detector")
            return False

        calibrating = obs.t_ms < self._config.calibration_window_s * 1000
        if not self._baseline_closed:
            self._baseline_builder.observe(obs)
            if not calibrating:
                self._baseline = self._baseline_builder.finalise(obs.t_ms)
                self._baseline_closed = True

        # The one control-flow difference from the shipped
        # Engine._process_one: no early return here. An in-window
        # observation falls through to scoring exactly like a
        # post-window one.
        llr = self._observation_llr(obs.duration_ms, prior)
        llr = self._apply_personalisation(obs, llr)
        boost, corroborated_by = corroborate.compute_boost(
            self._channels, channel, obs.t_ms, self._config
        )
        evidence = EvidenceItem(
            t_ms=obs.t_ms, llr=llr * boost, type=obs.type, observation_id=obs.seq
        )
        state.add(evidence)

        self._score, degraded = score_mod.safe_score(self._channels, self._config, self._score)
        self._degraded = self._degraded or degraded

        # The other difference: flag emission stays gated on `calibrating`
        # -- this is the one thing the real defect never touched.
        if evidence.llr >= self._config.flag_threshold and not calibrating:
            narrative = narrate_mod.narrate(obs.type, obs.duration_ms, corroborated_by)
            self._flag_counter += 1
            flags_mod.emit_or_merge(
                self._flags,
                self._channels,
                self._config,
                evidence,
                channel,
                corroborated_by,
                self._score,
                narrative,
                media_offset_ms=obs.t_ms,
                new_flag_id=f"flag-{self._flag_counter}",
            )
        return True


def _observations_in_window(observations: list[Observation], config: EngineConfig) -> int:
    window_ms = config.calibration_window_s * 1000
    return sum(1 for o in observations if o.t_ms < window_ms)


@dataclass(frozen=True)
class AblationResult:
    fixture: str
    condition_a_score: float
    condition_b_score: float
    observations_in_window: int
    observations_total: int


def run_ablation() -> list[AblationResult]:
    """Both fixtures, both conditions, all four numbers measured by
    actually replaying -- fixed inputs, no RNG, no wall-clock, so this is
    deterministic across calls."""
    results = []
    for name in ("honest_seed7", "staged_seed7"):
        observations = load_observations(_FIXTURE_DIR / f"{name}.jsonl")
        session_end = max(o.t_ms for o in observations)

        engine_a = Engine(STANDARD, Weights())
        engine_a.ingest(observations)
        result_a = engine_a.finalise(session_end)

        engine_b = _CalibrationLeakEngine(STANDARD, Weights())
        engine_b.ingest(observations)
        result_b = engine_b.finalise(session_end)

        assert result_a.score is not None
        assert result_b.score is not None

        results.append(
            AblationResult(
                fixture=name,
                condition_a_score=result_a.score,
                condition_b_score=result_b.score,
                observations_in_window=_observations_in_window(observations, STANDARD),
                observations_total=len(observations),
            )
        )
    return results


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    for r in run_ablation():
        logger.info(
            "%s: A(shipped)=%.6f B(prior defect)=%.6f, "
            "%d/%d observations inside the calibration window",
            r.fixture,
            r.condition_a_score,
            r.condition_b_score,
            r.observations_in_window,
            r.observations_total,
        )


if __name__ == "__main__":
    main()
