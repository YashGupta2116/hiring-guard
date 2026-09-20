"""The `weights.json` artifact: what calibration produces and the engine consumes.

Phase 3's output. Until it existed, `fusion/engine.py` scored every detector
off its hand-set `priors.py` entry and `Weights` carried nothing but a version
string. A fitted entry replaces that hand-set number with a curve over the
detector's raw confidence -- which the engine had been ignoring entirely --
and nothing else about scoring moves: duration scaling and the LLR clamp
still apply on top, exactly as they do to a prior.

Every entry carries its own `source`, so a report can say which detectors are
fitted and which are still guesses instead of presenting one number for both.
`dataset.kind` carries the same honesty one level up: a curve fitted on
generated fixtures is not evidence about real behaviour, and the artifact says
so rather than leaving the reader to assume.

Pydantic rather than a hand-written JSON schema because `jsonschema` is not an
approved dependency (Rules.md section 3) and a second copy of the shape would
drift from this one. `weights.schema.json` is generated from these models by
`python -m vtml.weights --write-schema`, so it cannot disagree with them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from vtml.types import Channel

WEIGHTS_SCHEMA_VERSION = 1

DatasetKind = Literal["synthetic", "recorded", "mixed"]


class FittedCurve(BaseModel):
    """A per-detector logistic over raw confidence, expressed as an LLR.

    `llr(c) = intercept + slope * c`, the fitted log-odds with the dataset's
    class prior removed (see `calibrate/fit.py` for the derivation). The engine
    treats the result as the detector's base LLR, in place of its prior.
    """

    intercept: float
    slope: float
    # The confidence range the fit was actually supported by. Outside it the
    # curve is extrapolation, and a caller that cares can say so.
    confidence_min: float
    confidence_max: float
    n_positives: int
    n_negatives: int
    # The median confidence of the positives -- what this detector reports for
    # a typical real event. It is the curve's operating point: a consumer that
    # wants one number for the detector rather than a function (the backend's
    # LLR_TABLE is one value per type and sensitivity) should read the curve
    # here, not at an end of the range, where it describes the least or most
    # certain detection instead of the usual one.
    positive_confidence_median: float

    def llr(self, confidence: float) -> float:
        return self.intercept + self.slope * confidence

    @property
    def reference_llr(self) -> float:
        """The LLR for a typical true detection from this detector."""
        return self.llr(self.positive_confidence_median)


class DetectorWeight(BaseModel):
    """One detector's entry: either a fitted curve or the prior it fell back to."""

    source: Literal["fitted", "prior"]
    channel: Channel
    # Always present: the hand-set prior from the registry, kept even on a
    # fitted entry so a consumer can compare the two without a second file.
    prior: float
    curve: FittedCurve | None = None
    # Why this detector is still on its prior, when it is. Phase 3's exit
    # criteria require the report to say which detectors are unfitted; this is
    # where the reason travels with the entry rather than only in the prose.
    reason: str | None = None

    def base_llr(self, confidence: float) -> float:
        if self.curve is None:
            return self.prior
        return self.curve.llr(confidence)


class DatasetProvenance(BaseModel):
    kind: DatasetKind
    sessions: list[str]
    n_rows: int
    n_positives: int
    # The overlap tolerance an observation was joined to a label with.
    match_tolerance_ms: int


class WeightsFile(BaseModel):
    schema_version: int = WEIGHTS_SCHEMA_VERSION
    version: str
    dataset: DatasetProvenance
    # Rules.md section 5's hand-set channel weights are the fallback when an
    # artifact does not carry its own; `EngineConfig.channel_weight` stays the
    # value the engine actually scores with.
    channel_weights: dict[Channel, float]
    detectors: dict[str, DetectorWeight] = Field(default_factory=dict)
    # Fits rejected for producing an out-of-clamp LLR. Phase 3's exit criteria
    # require a rejection to be loud rather than silently clipped, so the
    # rejected detector keeps its prior and the reason is recorded here.
    rejected: dict[str, str] = Field(default_factory=dict)

    @property
    def fitted_types(self) -> list[str]:
        return sorted(t for t, d in self.detectors.items() if d.source == "fitted")

    @property
    def prior_types(self) -> list[str]:
        return sorted(t for t, d in self.detectors.items() if d.source == "prior")


def load(path: Path) -> WeightsFile:
    return WeightsFile.model_validate_json(path.read_text(encoding="utf-8"))


def dump(weights: WeightsFile, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(weights.model_dump(mode="json"), indent=2, sort_keys=True))
        f.write("\n")
    return path


def write_schema(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(WeightsFile.model_json_schema(), indent=2, sort_keys=True))
        f.write("\n")
    return path
