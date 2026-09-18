"""What is actually computable from two synthetic fixtures and priors.

Phase 3 (fitted curves, 20 recordings) is cut, so this module never
computes flag precision, recall, a population median, or a reliability
rate -- there is no population. It reports final scores, per-channel
contributions, a raw matched/unmatched list against the staged labels,
and latency, all measured by actually running the engine.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from vtml.config import LENIENT, STANDARD, STRICT, EngineConfig
from vtml.detectors.schema import REGISTRY as DETECTOR_REGISTRY
from vtml.fixtures.synthetic.generate import generate
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Flag, Observation, SessionResult

_ML_ROOT = Path(__file__).resolve().parents[3]
_FIXTURE_DIR = _ML_ROOT / "fixtures" / "synthetic"

NOT_COMPUTABLE = (
    "Flag precision",
    "Flag recall",
    "Median score across a session population",
    "Calibration reliability",
)


def load_observations(path: Path) -> list[Observation]:
    with path.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def load_labels(path: Path) -> list[dict[str, int | str]]:
    with path.open(encoding="utf-8") as f:
        data: list[dict[str, int | str]] = json.load(f)
    return data


@dataclass(frozen=True)
class FixtureRun:
    name: str
    observations: list[Observation]
    result: SessionResult


@dataclass(frozen=True)
class FlagMatch:
    event_type: str
    label_t_start_ms: int
    flag: Flag | None

    @property
    def matched(self) -> bool:
        return self.flag is not None

    @property
    def latency_ms(self) -> int | None:
        if self.flag is None:
            return None
        return self.flag.t_start_ms - self.label_t_start_ms


@dataclass(frozen=True)
class LatencyStats:
    p50_ms: float
    p95_ms: float
    n_batches: int
    batch_size: int


@dataclass(frozen=True)
class SensitivityRun:
    preset: str
    honest_score: float
    staged_score: float


@dataclass(frozen=True)
class EvalMetrics:
    honest: FixtureRun
    staged: FixtureRun
    score_separation: float
    flag_matches: list[FlagMatch]
    latency: LatencyStats
    sensitivity: list[SensitivityRun]
    detectors_total: int
    detectors_fitted: int = field(default=0)


def run_fixture(name: str, observations: list[Observation], config: EngineConfig) -> FixtureRun:
    engine = Engine(config, Weights())
    engine.ingest(observations)
    result = engine.finalise(max(o.t_ms for o in observations))
    return FixtureRun(name=name, observations=observations, result=result)


def match_flags(flags: list[Flag], labels: list[dict[str, int | str]]) -> list[FlagMatch]:
    """One row per labelled staged event: the flag of the same detector
    type if one exists, or None. A raw list, never a rate -- two fixtures
    is not a sample precision or recall could be computed from."""
    matches = []
    for label in labels:
        event_type = str(label["event_type"])
        t_start = int(label["t_start_ms"])
        flag = next((f for f in flags if f.type == event_type), None)
        matches.append(FlagMatch(event_type=event_type, label_t_start_ms=t_start, flag=flag))
    return matches


def measure_batch_latency(
    config: EngineConfig, batch_size: int = 20, duration_s: int = 3600, seed: int = 4242
) -> LatencyStats:
    """Wall-clock latency of Engine.ingest() over consecutive batches of a
    dedicated hour-long synthetic stream (the two report fixtures are too
    short to fill more than one 20-observation batch) -- PRD section 7's
    fusion-latency target, measured rather than estimated."""
    observations, _labels = generate("staged", seed=seed, duration_s=duration_s)
    engine = Engine(config, Weights())
    ordered = sorted(observations, key=lambda o: o.t_ms)
    batches = [ordered[i : i + batch_size] for i in range(0, len(ordered), batch_size)]
    durations_ms: list[float] = []
    for batch in batches:
        if not batch:
            continue
        start = time.perf_counter()
        engine.ingest(batch)
        durations_ms.append((time.perf_counter() - start) * 1000)
    if not durations_ms:
        return LatencyStats(p50_ms=0.0, p95_ms=0.0, n_batches=0, batch_size=batch_size)
    return LatencyStats(
        p50_ms=float(np.percentile(durations_ms, 50)),
        p95_ms=float(np.percentile(durations_ms, 95)),
        n_batches=len(durations_ms),
        batch_size=batch_size,
    )


def sensitivity_sweep(
    honest: list[Observation], staged: list[Observation]
) -> list[SensitivityRun]:
    """Three real runs per fixture, one per sensitivity preset -- not an
    interpolation. `config.py` already defines LENIENT/STANDARD/STRICT."""
    runs = []
    for label, preset in (("lenient", LENIENT), ("standard", STANDARD), ("strict", STRICT)):
        honest_run = run_fixture("honest", honest, preset)
        staged_run = run_fixture("staged", staged, preset)
        assert honest_run.result.score is not None
        assert staged_run.result.score is not None
        runs.append(
            SensitivityRun(
                preset=label,
                honest_score=honest_run.result.score,
                staged_score=staged_run.result.score,
            )
        )
    return runs


def collect() -> EvalMetrics:
    honest_obs = load_observations(_FIXTURE_DIR / "honest_seed7.jsonl")
    staged_obs = load_observations(_FIXTURE_DIR / "staged_seed7.jsonl")
    labels = load_labels(_FIXTURE_DIR / "staged_seed7.labels.json")

    honest = run_fixture("honest_seed7", honest_obs, STANDARD)
    staged = run_fixture("staged_seed7", staged_obs, STANDARD)
    assert honest.result.score is not None
    assert staged.result.score is not None

    return EvalMetrics(
        honest=honest,
        staged=staged,
        score_separation=honest.result.score - staged.result.score,
        flag_matches=match_flags(staged.result.flags, labels),
        latency=measure_batch_latency(STANDARD),
        sensitivity=sensitivity_sweep(honest_obs, staged_obs),
        detectors_total=len(DETECTOR_REGISTRY),
        detectors_fitted=0,
    )


def channel_contributions(result: SessionResult) -> dict[Channel, float]:
    return dict(result.channels)
