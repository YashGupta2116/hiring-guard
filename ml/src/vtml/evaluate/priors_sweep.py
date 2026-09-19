"""F5: prior-sensitivity sweep.

The 16 hand-set priors in `priors.py` (via `detectors/schema.py::REGISTRY`)
were never fitted, so this answers the fairness question a hand-set number
always raises: does the verdict depend on the exact value chosen. One
scored channel's priors move at a time, log-spaced from 0.25x to 4x their
shipped default, replaying both report fixtures at every point.

This is a one-at-a-time sensitivity analysis, not a joint sweep --
interaction effects between two channels' priors moving together are not
computable from this design, the same spirit as Phase 4's precision/recall
being marked not computable rather than faked (see `metrics.py`).

`priors.py` holds one prior per *detector type*, not per channel, and a
channel can own several types (gaze has three). "Sweeping a channel's
prior" here means every detector type belonging to that channel is scaled
by the same multiplier at once -- the unit of analysis is the channel,
matching one F5 panel per channel, but the thing actually stored per
detector type is recorded in full in the CSV rather than collapsed to one
number.

`network` is excluded: `config.py`'s `channel_weight[NETWORK] = 0.0` by
design, so no multiplier on a network prior can ever move the score --
sweeping it would draw a flat line and call that a stability result.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

from vtml.config import STANDARD, EngineConfig
from vtml.detectors.schema import REGISTRY as DETECTOR_REGISTRY
from vtml.evaluate.metrics import load_observations
from vtml.fusion.engine import Engine, Weights
from vtml.priors import PRIORS
from vtml.types import Channel, Observation

_ML_ROOT = Path(__file__).resolve().parents[3]
_FIXTURE_DIR = _ML_ROOT / "fixtures" / "synthetic"

# network excluded -- see module docstring.
SWEPT_CHANNELS: tuple[Channel, ...] = (
    Channel.GAZE,
    Channel.AUDIO,
    Channel.SCENE,
    Channel.FOCUS,
    Channel.INPUT,
)

# Multiplicative, log-spaced, ratio sqrt(2) per step: 0.25x to 4x in 9
# points (2 ** i/2 for i in -4..4). Kept as exact powers of 2 and sqrt(2)
# rather than a computed linspace, so re-running this module never differs
# from a prior run by float rounding in the multiplier itself.
MULTIPLIERS: tuple[float, ...] = (
    0.25,
    0.25 * 2**0.5,
    0.5,
    0.5 * 2**0.5,
    1.0,
    2**0.5,
    2.0,
    2.0 * 2**0.5,
    4.0,
)

# A prior has no declared lower bound in detectors/schema.py, but a
# negative one would flip evidence direction, which nothing in this design
# intends to explore -- clamp at zero and record it, rather than silently
# producing a meaningless row (handoff's own instruction: clamp and record,
# never skip).
_PRIOR_FLOOR = 0.0


@dataclass(frozen=True)
class SweepPoint:
    channel: Channel
    multiplier: float
    prior_overrides: dict[str, float]
    clamped: bool
    honest_score: float
    honest_band: str
    honest_flags: int
    honest_gaze_llr: float
    honest_focus_llr: float
    staged_score: float
    staged_band: str
    staged_flags: int


def scaled_priors(channel: Channel, multiplier: float) -> tuple[dict[str, float], bool]:
    """Every detector type registered under `channel` scaled by
    `multiplier`; every other type left at its shipped default. Returns
    the full overridden dict (ready for `Engine(priors=...)`) plus whether
    any value needed clamping to `_PRIOR_FLOOR`."""
    overrides = dict(PRIORS)
    clamped = False
    for type_, spec in DETECTOR_REGISTRY.items():
        if spec.channel != channel:
            continue
        scaled = spec.prior * multiplier
        if scaled < _PRIOR_FLOOR:
            scaled = _PRIOR_FLOOR
            clamped = True
        overrides[type_] = scaled
    return overrides, clamped


def _run_point(
    channel: Channel,
    multiplier: float,
    honest_obs: list[Observation],
    staged_obs: list[Observation],
) -> SweepPoint:
    overrides, clamped = scaled_priors(channel, multiplier)
    channel_types = {t for t, spec in DETECTOR_REGISTRY.items() if spec.channel == channel}
    prior_overrides = {t: overrides[t] for t in sorted(channel_types)}

    honest_engine = Engine(STANDARD, Weights(), priors=overrides)
    honest_engine.ingest(honest_obs)
    honest_result = honest_engine.finalise(max(o.t_ms for o in honest_obs))

    staged_engine = Engine(STANDARD, Weights(), priors=overrides)
    staged_engine.ingest(staged_obs)
    staged_result = staged_engine.finalise(max(o.t_ms for o in staged_obs))

    assert honest_result.score is not None
    assert staged_result.score is not None

    return SweepPoint(
        channel=channel,
        multiplier=multiplier,
        prior_overrides=prior_overrides,
        clamped=clamped,
        honest_score=honest_result.score,
        honest_band=honest_result.band,
        honest_flags=len(honest_result.flags),
        honest_gaze_llr=honest_result.channels[Channel.GAZE],
        honest_focus_llr=honest_result.channels[Channel.FOCUS],
        staged_score=staged_result.score,
        staged_band=staged_result.band,
        staged_flags=len(staged_result.flags),
    )


def run_sweep() -> list[SweepPoint]:
    """One row per (channel, multiplier), both fixtures replayed at each --
    45 rows for 5 channels x 9 multipliers. Fixed inputs, no RNG, no
    wall-clock: two calls to this function return identical rows."""
    honest_obs = load_observations(_FIXTURE_DIR / "honest_seed7.jsonl")
    staged_obs = load_observations(_FIXTURE_DIR / "staged_seed7.jsonl")
    return [
        _run_point(channel, multiplier, honest_obs, staged_obs)
        for channel in SWEPT_CHANNELS
        for multiplier in MULTIPLIERS
    ]


def assert_no_leakage() -> None:
    """The handoff's own check: after sweeping, a freshly constructed
    default Engine must still reproduce the pinned honest_seed7 baseline
    exactly. `Engine(priors=...)` copies its dict at construction and
    never writes back to the module-level `PRIORS`, so there is nothing
    for a sweep point to leak into the next one -- this asserts that
    holds, rather than trusting the design description."""
    honest_obs = load_observations(_FIXTURE_DIR / "honest_seed7.jsonl")
    engine = Engine(EngineConfig(), Weights())
    engine.ingest(honest_obs)
    result = engine.finalise(max(o.t_ms for o in honest_obs))
    assert result.score == 94.28386762280083, (
        f"pinned baseline moved after the sweep: got {result.score}"
    )


def write_csv(points: list[SweepPoint], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "channel",
        "multiplier",
        "prior_overrides",
        "clamped",
        "honest_score",
        "honest_band",
        "honest_flags",
        "honest_gaze_llr",
        "honest_focus_llr",
        "staged_score",
        "staged_band",
        "staged_flags",
    ]
    with path.open("w", encoding="utf-8", newline="\n") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for p in points:
            writer.writerow(
                [
                    p.channel.value,
                    repr(p.multiplier),
                    json.dumps(p.prior_overrides, sort_keys=True),
                    p.clamped,
                    repr(p.honest_score),
                    p.honest_band,
                    p.honest_flags,
                    repr(p.honest_gaze_llr),
                    repr(p.honest_focus_llr),
                    repr(p.staged_score),
                    p.staged_band,
                    p.staged_flags,
                ]
            )
    return path


@dataclass(frozen=True)
class StabilityResult:
    channel: Channel
    # None means the verdict held across the entire swept range -- there is
    # no narrower contiguous window to report, not "not computable".
    widest_range: tuple[float, float] | None
    # False means neither fixture ever produces an observation on this
    # channel, so every multiplier is a no-op and "verdict holds
    # everywhere" is not a stability result -- it is untested. audio is
    # the one case (disabled in v1, PRD.md section 5): excluded from the
    # headline narrowest-channel count for exactly this reason.
    exercised: bool


def stability_statistic(points: list[SweepPoint]) -> list[StabilityResult]:
    """Widest contiguous run of swept multipliers, per channel, over which
    honest stays `clear` and staged stays `suppressed`. Multipliers are
    already in ascending order (MULTIPLIERS is sorted), so "contiguous" is
    a run of consecutive list indices."""
    results: list[StabilityResult] = []
    for channel in SWEPT_CHANNELS:
        row_by_mult = {p.multiplier: p for p in points if p.channel == channel}
        ordered = [row_by_mult[m] for m in MULTIPLIERS]
        holds = [r.honest_band == "clear" and r.staged_band == "suppressed" for r in ordered]
        exercised = len({(r.honest_score, r.staged_score) for r in ordered}) > 1

        default_idx = MULTIPLIERS.index(1.0)
        # A multiplier of exactly 1.0 changes no prior at all, for any
        # channel, so this must reproduce the pinned baseline (honest
        # clear, staged suppressed) structurally -- if it does not, the
        # sweep itself is broken, not the finding. Matches the handoff's
        # stop condition: "the pinned baseline does not reproduce at
        # default priors, at any point."
        assert holds[default_idx], (
            f"{channel.value}: verdict fails at multiplier=1.0, the shipped default -- "
            "sweep is broken, this is not a real finding"
        )

        best: tuple[int, int] | None = None
        start: int | None = None
        for i, ok in enumerate(holds):
            if ok and start is None:
                start = i
            if (not ok or i == len(holds) - 1) and start is not None:
                end = i if ok else i - 1
                if best is None or (end - start) > (best[1] - best[0]):
                    best = (start, end)
                start = None
        assert best is not None  # holds[default_idx] is True, so at least one run exists

        widest_range = None if best == (0, len(MULTIPLIERS) - 1) else (
            MULTIPLIERS[best[0]],
            MULTIPLIERS[best[1]],
        )
        results.append(
            StabilityResult(
                channel=channel,
                widest_range=widest_range,
                exercised=exercised,
            )
        )
    return results


def narrowest_exercised(results: list[StabilityResult]) -> StabilityResult:
    """The honest headline the handoff asks for: the narrowest stability
    range among channels either fixture actually exercises. A channel
    that is a no-op in both fixtures (its score never moves) held the
    verdict trivially, not stably, and cannot be the narrowest -- or the
    widest -- of anything real, so it is excluded rather than winning by
    default."""
    exercised = [r for r in results if r.exercised]
    if not exercised:
        raise ValueError("no swept channel is exercised by either fixture")

    def width(r: StabilityResult) -> float:
        if r.widest_range is None:
            return MULTIPLIERS[-1] / MULTIPLIERS[0]
        return r.widest_range[1] / r.widest_range[0]

    return min(exercised, key=width)


def main() -> None:
    import logging

    # Deferred: figures.py imports SweepPoint/StabilityResult/etc. from this
    # module at its own top level (same direction metrics.py -> figures.py
    # already uses); importing figures back here at module scope would be
    # circular. By the time main() runs this module has already finished
    # loading, so the import resolves fine here.
    from vtml.evaluate import figures

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    for substitution in figures.configure_style():
        logger.info("font substitution: %s", substitution)

    assert_no_leakage()
    points = run_sweep()
    csv_path = write_csv(points, _ML_ROOT / "reports" / "f5_prior_sensitivity_sweep.csv")
    assert_no_leakage()
    logger.info("wrote %s (%d rows)", csv_path, len(points))

    results = stability_statistic(points)
    figure_path = figures.save_f5(_ML_ROOT / "reports", points, results)
    logger.info("wrote %s", figure_path)
    for result in results:
        span = "full swept range (0.25x-4x)" if result.widest_range is None else (
            f"{result.widest_range[0]:.4f}x-{result.widest_range[1]:.4f}x"
        )
        tag = "" if result.exercised else " -- NOT EXERCISED, no observations in either fixture"
        logger.info("%s: widest stable range %s%s", result.channel.value, span, tag)

    headline = narrowest_exercised(results)
    logger.info("narrowest exercised channel: %s", headline.channel.value)


if __name__ == "__main__":
    main()
