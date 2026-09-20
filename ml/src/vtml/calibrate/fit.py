"""Phase 3 task 6: fit a curve per detector, write `weights.json`.

**What is fitted.** One logistic per detector type over its raw confidence,
which the engine had been discarding -- every observation of a given type
scored the same hand-set prior regardless of how sure the detector was.

**Why the class prior comes back out.** scikit-learn's logistic gives a
*discriminative* model, `logit P(positive | c) = b + w*c`, a posterior that
carries the dataset's own base rate. The engine wants a likelihood ratio,
`log( P(c | positive) / P(c | negative) )`, which is the same line with that
base rate removed:

    LLR(c) = (b + w*c) - log(n_positives / n_negatives)

Leaving the base rate in would bake "how often this fixture set staged the
event" into the score, so a curve fitted on a half-staged set would read as
evidence on a live session that is overwhelmingly honest.

**Rejection, not clipping -- at the ceiling.** Phase 3's exit criteria require
a fit that leaves the clamp to be rejected rather than silently clipped: a
curve that wants to put an observation at LLR 9 is not a curve whose top needs
trimming to 4, it is a fit nobody should trust. Such a detector keeps its prior
and the reason travels in `weights.json`'s `rejected` map.

That rule applies to `llr_clamp_max` only, and the asymmetry is deliberate. An
LLR is centred at zero by construction -- zero is "no evidence either way" --
while the clamp is `[-1.0, 4.0]`, centred at +1.5. Measured across separations,
the +4.0 ceiling is never approached, while the -1.0 floor trips as soon as a
detector discriminates at all (positives around 0.70 against negatives around
0.42 already reaches -1.036). Read literally against both bounds, the criterion
admits only detectors that barely work.

The two bounds are also not symmetric in what clipping them costs. Clipping at
the ceiling hides a fit that wanted to dominate the score, which is why it is
rejected instead. Clipping at the floor makes a curve *less* exculpatory than
the fit asked for: it moves the score against the candidate, so it cannot
manufacture a false positive, and the engine's own per-observation clamp
already handles it. Rejecting a curve for reaching the floor throws away a
usable fit for no safety gain.

scikit-learn is a dev dependency and this module is excluded from the runtime
import rule by name (Rules.md section 3) -- nothing under `fusion/` imports it.
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

from vtml.calibrate.dataset import (
    MATCH_TOLERANCE_MS,
    MIN_POSITIVES_TO_FIT,
    FittingTable,
    build_table,
    discover_fixtures,
)
from vtml.config import STANDARD
from vtml.detectors.schema import REGISTRY
from vtml.weights import (
    DatasetKind,
    DatasetProvenance,
    DetectorWeight,
    FittedCurve,
    WeightsFile,
    dump,
    write_schema,
)

logger = logging.getLogger(__name__)

_DEFAULT_OUT = Path(__file__).resolve().parents[3] / "weights" / "weights.json"
_DEFAULT_SCHEMA = _DEFAULT_OUT.with_name("weights.schema.json")

# The fit is a two-parameter line over one feature; regularisation exists only
# to keep a separable detector's slope finite rather than to select a model.
_REGULARISATION_C = 1.0

# Probe points across the supported confidence range when checking the clamp.
_CLAMP_PROBE_POINTS = 32

_REJECTED_MARKER = "fit rejected"


@dataclass(frozen=True)
class FitOutcome:
    detector_type: str
    curve: FittedCurve | None
    reason: str | None


def _fit_one(
    detector_type: str,
    confidences: np.ndarray,
    positives: np.ndarray,
) -> FitOutcome:
    n_pos = int(positives.sum())
    n_neg = int(len(positives) - n_pos)
    if n_pos < MIN_POSITIVES_TO_FIT:
        return FitOutcome(
            detector_type, None, f"only {n_pos} positives, needs {MIN_POSITIVES_TO_FIT}"
        )
    if n_neg == 0:
        # No negatives means no ratio to form: every observation of this type
        # in the set was a real event, which says nothing about what a low
        # confidence from the same detector would mean.
        return FitOutcome(detector_type, None, f"{n_pos} positives but no negatives to contrast")

    model = LogisticRegression(C=_REGULARISATION_C)
    model.fit(confidences.reshape(-1, 1), positives)
    slope = float(model.coef_[0][0])
    intercept = float(model.intercept_[0]) - math.log(n_pos / n_neg)

    if not (math.isfinite(slope) and math.isfinite(intercept)):
        return FitOutcome(detector_type, None, "fit produced a non-finite coefficient")

    c_min, c_max = float(confidences.min()), float(confidences.max())
    # Read the extremes off the probed range rather than assuming they sit at
    # the ends, so this stays correct if the curve form ever stops being linear.
    probe = np.linspace(c_min, c_max, _CLAMP_PROBE_POINTS)
    llrs = intercept + slope * probe
    high = float(llrs.max())
    # Ceiling only; see the module docstring for why the floor is left to the
    # engine's own per-observation clamp.
    if high > STANDARD.llr_clamp_max:
        return FitOutcome(
            detector_type,
            None,
            (
                f"fitted LLR reaches {high:.3f} at confidence {c_max:.2f}, above the "
                f"clamp ceiling {STANDARD.llr_clamp_max}; {_REJECTED_MARKER}"
            ),
        )

    return FitOutcome(
        detector_type,
        FittedCurve(
            intercept=intercept,
            slope=slope,
            confidence_min=c_min,
            confidence_max=c_max,
            n_positives=n_pos,
            n_negatives=n_neg,
            positive_confidence_median=float(np.median(confidences[positives == 1])),
        ),
        None,
    )


def fit(table: FittingTable, version: str, dataset_kind: DatasetKind) -> WeightsFile:
    detectors: dict[str, DetectorWeight] = {}
    rejected: dict[str, str] = {}

    # Every registered detector gets an entry, not only the ones the set
    # happened to exercise: a consumer reading weights.json should see that a
    # detector is on its prior, not find it missing and have to guess why.
    for detector_type, spec in sorted(REGISTRY.items()):
        rows = table.for_detector(detector_type)
        outcome = FitOutcome(detector_type, None, "not present in the calibration set")
        if rows:
            confidences = np.array([r.confidence for r in rows], dtype=float)
            positives = np.array([r.positive for r in rows], dtype=int)
            outcome = _fit_one(detector_type, confidences, positives)

        if outcome.curve is not None:
            detectors[detector_type] = DetectorWeight(
                source="fitted", channel=spec.channel, prior=spec.prior, curve=outcome.curve
            )
            continue

        reason = outcome.reason or "no fit"
        if _REJECTED_MARKER in reason:
            rejected[detector_type] = reason
        detectors[detector_type] = DetectorWeight(
            source="prior", channel=spec.channel, prior=spec.prior, reason=reason
        )

    return WeightsFile(
        version=version,
        dataset=DatasetProvenance(
            kind=dataset_kind,
            sessions=list(table.sessions),
            n_rows=len(table.rows),
            n_positives=table.n_positives,
            match_tolerance_ms=table.match_tolerance_ms,
        ),
        channel_weights=dict(STANDARD.channel_weight),
        detectors=detectors,
        rejected=rejected,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Fit calibration curves and write weights.json.")
    parser.add_argument("--fixtures", type=Path, nargs="+", required=True)
    parser.add_argument("--version", required=True, help="e.g. phase3-synthetic-1")
    parser.add_argument(
        "--dataset-kind",
        choices=["synthetic", "recorded", "mixed"],
        required=True,
        help="what the curves were fitted on; synthetic is not evidence about real behaviour",
    )
    parser.add_argument("--tolerance-ms", type=int, default=MATCH_TOLERANCE_MS)
    parser.add_argument("--out", type=Path, default=_DEFAULT_OUT)
    parser.add_argument("--write-schema", action="store_true")
    args = parser.parse_args(argv)

    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    paths = [p for p in args.fixtures if p.is_file()]
    paths.extend(discover_fixtures([p for p in args.fixtures if p.is_dir()]))
    table = build_table(sorted(set(paths)), args.tolerance_ms)
    weights = fit(table, args.version, args.dataset_kind)

    out = dump(weights, args.out)
    logger.info("%s: %d rows, %d positive", out, len(table.rows), table.n_positives)
    logger.info(
        "fitted (%d): %s", len(weights.fitted_types), ", ".join(weights.fitted_types) or "none"
    )
    logger.info("on priors (%d):", len(weights.prior_types))
    for detector_type in weights.prior_types:
        logger.info("    %-34s %s", detector_type, weights.detectors[detector_type].reason)
    if weights.rejected:
        logger.info("rejected fits (%d):", len(weights.rejected))
        for detector_type, reason in sorted(weights.rejected.items()):
            logger.info("    %-34s %s", detector_type, reason)
    if args.write_schema:
        logger.info("schema: %s", write_schema(_DEFAULT_SCHEMA))


if __name__ == "__main__":
    main()
