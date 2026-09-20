"""Phase 3's pipeline: the observation-to-label join, and the fit.

The rejection path gets its own tests. With the committed calibration set most
detectors are rejected or absent, so without these the reject branch would be
covered only incidentally by whichever way the fixture data happened to fall.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from vtml.calibrate import dataset as ds
from vtml.calibrate import fit as ft
from vtml.config import STANDARD
from vtml.types import Channel, Observation, Source
from vtml.weights import WeightsFile


def _obs(seq: int, t_ms: int, type_: str, confidence: float, duration_ms: int | None = 1000) -> Observation:
    channel = Channel(type_.split(".")[0])
    return Observation(
        seq=seq,
        t_ms=t_ms,
        channel=channel,
        type=type_,
        confidence=confidence,
        duration_ms=duration_ms,
        features={},
        detector=f"synthetic.{channel.value}@1.0.0",
        source=Source.SYNTHETIC,
    )


# -- the join ---------------------------------------------------------------


def test_observation_inside_its_label_window_is_a_positive() -> None:
    labels = [ds.LabelWindow(10_000, 14_000, "scene.multiple_faces")]
    rows = ds.build_rows("s", [_obs(0, 11_000, "scene.multiple_faces", 0.8)], labels)
    assert rows[0].positive


def test_observation_of_a_different_type_is_not_a_positive() -> None:
    """Type-matched, like evaluate/metrics.py::match_flags: one detector is
    never credited for an event another detector's label explains."""
    labels = [ds.LabelWindow(10_000, 14_000, "scene.multiple_faces")]
    rows = ds.build_rows("s", [_obs(0, 11_000, "scene.face_absent", 0.8)], labels)
    assert not rows[0].positive


def test_observation_outside_every_window_is_a_negative() -> None:
    labels = [ds.LabelWindow(10_000, 14_000, "scene.multiple_faces")]
    far = 14_000 + ds.MATCH_TOLERANCE_MS + 1_000
    rows = ds.build_rows("s", [_obs(0, far, "scene.multiple_faces", 0.8)], labels)
    assert not rows[0].positive


def test_the_match_tolerance_is_applied_at_both_ends() -> None:
    labels = [ds.LabelWindow(10_000, 14_000, "scene.multiple_faces")]
    before = _obs(0, 10_000 - ds.MATCH_TOLERANCE_MS, "scene.multiple_faces", 0.8, duration_ms=0)
    after = _obs(1, 14_000 + ds.MATCH_TOLERANCE_MS, "scene.multiple_faces", 0.8, duration_ms=0)
    rows = ds.build_rows("s", [before, after], labels)
    assert [r.positive for r in rows] == [True, True]


def test_a_point_event_has_no_duration_to_overlap_with() -> None:
    labels = [ds.LabelWindow(120_000, 120_000, "input.large_paste")]
    rows = ds.build_rows("s", [_obs(0, 120_000, "input.large_paste", 0.9, duration_ms=None)], labels)
    assert rows[0].positive


def test_an_unlabelled_session_yields_only_negatives() -> None:
    """An honest session has no label file at all, which is not an error."""
    rows = ds.build_rows("honest", [_obs(0, 90_000, "gaze.offscreen_glance", 0.3)], [])
    assert rows and not any(r.positive for r in rows)


def test_missing_label_file_reads_as_no_labels(tmp_path: Path) -> None:
    assert ds.load_labels(tmp_path / "absent.labels.json") == []


def test_labels_round_trip_from_the_generator_format(tmp_path: Path) -> None:
    path = tmp_path / "s.labels.json"
    path.write_text(
        json.dumps([{"t_start_ms": 1, "t_end_ms": 2, "event_type": "input.large_paste"}]),
        encoding="utf-8",
    )
    assert ds.load_labels(path) == [ds.LabelWindow(1, 2, "input.large_paste")]


# -- the fit ----------------------------------------------------------------


def _separable(n_pos: int, n_neg: int, pos_c: float, neg_c: float) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(3)
    confidences = np.concatenate(
        [
            np.clip(rng.normal(pos_c, 0.05, n_pos), 0.0, 1.0),
            np.clip(rng.normal(neg_c, 0.05, n_neg), 0.0, 1.0),
        ]
    )
    positives = np.concatenate([np.ones(n_pos), np.zeros(n_neg)]).astype(int)
    return confidences, positives


def test_too_few_positives_falls_back_to_the_prior() -> None:
    confidences, positives = _separable(ds.MIN_POSITIVES_TO_FIT - 1, 40, 0.8, 0.3)
    outcome = ft._fit_one("scene.multiple_faces", confidences, positives)
    assert outcome.curve is None
    assert outcome.reason is not None and "needs" in outcome.reason


def test_no_negatives_leaves_nothing_to_contrast() -> None:
    confidences, positives = _separable(30, 0, 0.8, 0.3)
    outcome = ft._fit_one("scene.multiple_faces", confidences, positives)
    assert outcome.curve is None
    assert outcome.reason is not None and "no negatives" in outcome.reason


def test_a_well_separated_fit_stays_under_the_clamp_ceiling() -> None:
    confidences, positives = _separable(30, 60, 0.75, 0.40)
    outcome = ft._fit_one("focus.tab_hidden", confidences, positives)
    assert outcome.curve is not None, outcome.reason
    curve = outcome.curve
    assert curve.slope > 0, "higher confidence must mean more evidence, not less"
    assert curve.llr(curve.confidence_max) <= STANDARD.llr_clamp_max


def test_a_fit_above_the_clamp_ceiling_is_rejected_rather_than_clipped() -> None:
    """A curve that wants to put an observation above the clamp ceiling is not
    a curve whose top needs trimming to 4.0, it is a fit nobody should trust.
    Perfect separation at the ends of the confidence range gets there."""
    n = 800
    confidences = np.concatenate([np.full(n, 1.0), np.full(n, 0.0)])
    positives = np.concatenate([np.ones(n), np.zeros(n)]).astype(int)
    outcome = ft._fit_one("scene.multiple_faces", confidences, positives)
    assert outcome.curve is None
    assert outcome.reason is not None
    assert ft._REJECTED_MARKER in outcome.reason
    assert "above the clamp ceiling" in outcome.reason


def test_a_fit_reaching_below_the_clamp_floor_is_kept() -> None:
    """The floor is left to the engine's per-observation clamp. Clipping there
    makes evidence less exculpatory, which moves the score against the
    candidate and so cannot manufacture a false positive -- rejecting the
    curve for it would discard a usable fit for no safety gain. The ceiling,
    which is the side that can, is still rejected (above)."""
    confidences, positives = _separable(40, 40, 0.85, 0.30)
    outcome = ft._fit_one("gaze.persistent_offscreen", confidences, positives)
    assert outcome.curve is not None, outcome.reason
    assert outcome.curve.llr(outcome.curve.confidence_min) < STANDARD.llr_clamp_min
    assert outcome.curve.llr(outcome.curve.confidence_max) <= STANDARD.llr_clamp_max


def test_the_class_prior_is_removed_from_the_intercept() -> None:
    """The engine wants a likelihood ratio, not a posterior. sklearn fits
    `logit P(positive | c)`, which carries the set's own base rate; leaving it
    in would bake "how often this fixture set staged the event" into live
    scores. The curve must be that log-odds minus `log(n_pos / n_neg)`,
    exactly -- checked against a fit done here rather than inferred from two
    datasets, so this tests the conversion and not the fitter's variance."""
    from sklearn.linear_model import LogisticRegression

    n_pos, n_neg = 30, 90
    confidences, positives = _separable(n_pos, n_neg, 0.75, 0.40)
    outcome = ft._fit_one("focus.tab_hidden", confidences, positives)
    assert outcome.curve is not None, outcome.reason

    reference = LogisticRegression(C=ft._REGULARISATION_C)
    reference.fit(confidences.reshape(-1, 1), positives)
    offset = math.log(n_pos / n_neg)

    for c in (0.3, 0.5, 0.75, 0.9):
        posterior_log_odds = float(reference.intercept_[0]) + float(reference.coef_[0][0]) * c
        assert outcome.curve.llr(c) == pytest.approx(posterior_log_odds - offset)

    # The set is 1:3, so the shift is a full log(1/3) and not merely rounding.
    assert offset == pytest.approx(math.log(1 / 3))
    assert outcome.curve.llr(0.75) != pytest.approx(
        float(reference.intercept_[0]) + float(reference.coef_[0][0]) * 0.75
    )


# -- the artifact -----------------------------------------------------------


def test_every_registered_detector_gets_an_entry() -> None:
    from vtml.detectors.schema import REGISTRY

    table = ds.FittingTable(rows=(), sessions=("none",), match_tolerance_ms=ds.MATCH_TOLERANCE_MS)
    weights = ft.fit(table, "test", "synthetic")
    assert set(weights.detectors) == set(REGISTRY)
    assert weights.fitted_types == []


def test_a_detector_on_its_prior_says_why() -> None:
    table = ds.FittingTable(rows=(), sessions=("none",), match_tolerance_ms=ds.MATCH_TOLERANCE_MS)
    weights = ft.fit(table, "test", "synthetic")
    for entry in weights.detectors.values():
        assert entry.source == "prior"
        assert entry.reason, "an unfitted detector must record its reason"
        assert entry.base_llr(0.9) == entry.prior


def test_committed_weights_validate_and_declare_synthetic_provenance() -> None:
    """The shipped artifact is fitted on generated fixtures. It has to say so:
    a curve fitted on synthetic data is not evidence about real behaviour."""
    path = Path(ft._DEFAULT_OUT)
    weights = WeightsFile.model_validate_json(path.read_text(encoding="utf-8"))
    assert weights.dataset.kind == "synthetic"
    assert weights.dataset.n_rows > 0
    for detector_type, entry in weights.detectors.items():
        if entry.source == "fitted":
            assert entry.curve is not None, detector_type
        else:
            assert entry.reason, detector_type


def test_committed_schema_matches_the_model() -> None:
    """weights.schema.json is generated from WeightsFile, so a model change
    that was not regenerated is a drift the backend would read stale."""
    path = Path(ft._DEFAULT_SCHEMA)
    committed = json.loads(path.read_text(encoding="utf-8"))
    assert committed == WeightsFile.model_json_schema()


def test_no_fitted_curve_in_the_committed_artifact_exceeds_the_clamp_ceiling() -> None:
    weights = WeightsFile.model_validate_json(
        Path(ft._DEFAULT_OUT).read_text(encoding="utf-8")
    )
    for detector_type, entry in weights.detectors.items():
        if entry.curve is None:
            continue
        assert entry.curve.llr(entry.curve.confidence_max) <= STANDARD.llr_clamp_max, detector_type


def test_rejected_fits_keep_their_prior_and_are_listed() -> None:
    weights = WeightsFile.model_validate_json(
        Path(ft._DEFAULT_OUT).read_text(encoding="utf-8")
    )
    for detector_type, reason in weights.rejected.items():
        assert weights.detectors[detector_type].source == "prior"
        assert ft._REJECTED_MARKER in reason


@pytest.mark.parametrize("confidence", [0.0, 0.25, 0.5, 0.75, 1.0])
def test_a_prior_entry_ignores_confidence(confidence: float) -> None:
    """Falling back to a prior means falling back to the pre-Phase-3
    behaviour exactly: one number per detector type, confidence discarded."""
    table = ds.FittingTable(rows=(), sessions=("none",), match_tolerance_ms=ds.MATCH_TOLERANCE_MS)
    entry = ft.fit(table, "test", "synthetic").detectors["scene.multiple_faces"]
    assert entry.base_llr(confidence) == entry.prior


# -- the engine reading the artifact ----------------------------------------


def test_default_weights_score_off_priors_exactly_as_before_phase_3() -> None:
    """`Weights()` carries no curves, so every detector falls through to its
    prior. The locked regression baseline and the goldens are pinned against
    this path; it must not move because Phase 3 exists."""
    from vtml.fusion.engine import Engine, Weights

    engine = Engine(STANDARD, Weights())
    obs = _obs(0, 90_000, "scene.multiple_faces", 0.42)
    prior = 2.0
    assert engine._base_llr(obs, prior) == prior


def test_a_fitted_curve_replaces_the_prior_and_reads_confidence() -> None:
    from vtml.fusion.engine import Engine, Weights
    from vtml.weights import FittedCurve

    curve = FittedCurve(
        intercept=-1.0,
        slope=3.0,
        confidence_min=0.2,
        confidence_max=1.0,
        n_positives=20,
        n_negatives=60,
        positive_confidence_median=0.8,
    )
    engine = Engine(STANDARD, Weights(version="t", curves={"scene.multiple_faces": curve}))

    low = engine._base_llr(_obs(0, 90_000, "scene.multiple_faces", 0.3), 2.0)
    high = engine._base_llr(_obs(1, 91_000, "scene.multiple_faces", 0.9), 2.0)
    assert low == pytest.approx(-1.0 + 3.0 * 0.3)
    assert high == pytest.approx(-1.0 + 3.0 * 0.9)
    assert high > low, "a more confident detection must carry more evidence"
    # The prior is no longer consulted for a fitted type.
    assert low != pytest.approx(2.0) and high != pytest.approx(2.0)


def test_an_unfitted_type_still_uses_its_prior_when_others_are_fitted() -> None:
    from vtml.fusion.engine import Engine, Weights
    from vtml.weights import FittedCurve

    curve = FittedCurve(
        intercept=0.0, slope=1.0, confidence_min=0.0, confidence_max=1.0,
        n_positives=20, n_negatives=20, positive_confidence_median=0.8,
    )
    engine = Engine(STANDARD, Weights(version="t", curves={"scene.multiple_faces": curve}))
    assert engine._base_llr(_obs(0, 90_000, "gaze.offscreen_glance", 0.3), 0.3) == 0.3


@pytest.mark.parametrize("confidence", [0.0, 0.05, 0.19])
def test_confidence_below_the_fitted_range_is_clamped_not_extrapolated(confidence: float) -> None:
    """A line fitted between 0.2 and 1.0 says nothing trustworthy at 0.05.
    Extrapolating would hand the least certain detections the largest
    magnitudes, which is backwards."""
    from vtml.fusion.engine import Engine, Weights
    from vtml.weights import FittedCurve

    curve = FittedCurve(
        intercept=-1.0, slope=3.0, confidence_min=0.2, confidence_max=1.0,
        n_positives=20, n_negatives=60, positive_confidence_median=0.8,
    )
    engine = Engine(STANDARD, Weights(version="t", curves={"scene.multiple_faces": curve}))
    assert engine._base_llr(_obs(0, 90_000, "scene.multiple_faces", confidence), 2.0) == pytest.approx(
        curve.llr(0.2)
    )


def test_confidence_above_the_fitted_range_is_clamped_too() -> None:
    from vtml.fusion.engine import Engine, Weights
    from vtml.weights import FittedCurve

    curve = FittedCurve(
        intercept=-1.0, slope=3.0, confidence_min=0.2, confidence_max=0.9,
        n_positives=20, n_negatives=60, positive_confidence_median=0.8,
    )
    engine = Engine(STANDARD, Weights(version="t", curves={"scene.multiple_faces": curve}))
    assert engine._base_llr(_obs(0, 90_000, "scene.multiple_faces", 1.0), 2.0) == pytest.approx(
        curve.llr(0.9)
    )


def test_weights_from_file_loads_only_accepted_curves() -> None:
    """A rejected or unfitted detector must be absent from `curves`, so the
    engine's lookup falls through to its prior rather than finding a curve
    nobody accepted."""
    from vtml.fusion.engine import Weights

    weights = Weights.from_file(Path(ft._DEFAULT_OUT))
    artifact = WeightsFile.model_validate_json(
        Path(ft._DEFAULT_OUT).read_text(encoding="utf-8")
    )
    assert weights.version == artifact.version
    assert set(weights.curves) == set(artifact.fitted_types)
    for detector_type in artifact.rejected:
        assert detector_type not in weights.curves


def test_the_committed_artifact_does_not_move_the_honest_goldens() -> None:
    """Phase 3's curves are fitted on staged event types. Swapping the prior
    artifact for the fitted one must not cost an honest session anything --
    if it did, calibration would have bought detection at the price of the
    false-positive behaviour Rules section 8 protects."""
    from vtml.fixtures import golden
    from vtml.fusion.engine import Engine, Weights

    fitted = Weights.from_file(Path(ft._DEFAULT_OUT))
    for name in ("honest_clean", "honest_noisy_camera"):
        observations = sorted(golden.load(name), key=lambda o: o.t_ms)
        engine = Engine(STANDARD, fitted)
        engine.ingest(observations)
        result = engine.finalise(golden.GOLDEN_END_MS)
        assert result.score is not None
        assert result.score > STANDARD.band_clear_min, f"{name} scored {result.score:.2f}"
        assert result.flags == []


def test_every_fitted_curve_slopes_upward() -> None:
    """More confidence must mean more evidence. A negative slope would mean the
    detector is anti-correlated with its own ground truth, which is a broken
    detector or a broken join, not a curve to ship."""
    artifact = WeightsFile.model_validate_json(
        Path(ft._DEFAULT_OUT).read_text(encoding="utf-8")
    )
    fitted = [(t, e.curve) for t, e in artifact.detectors.items() if e.curve is not None]
    assert fitted, "the committed artifact should carry at least one fitted curve"
    for detector_type, curve in fitted:
        assert curve is not None
        assert curve.slope > 0, detector_type


def test_the_reference_llr_is_the_curve_at_the_positive_median() -> None:
    """The operating point the backend reads. Taken at the median confidence of
    the positives -- what the detector reports for a typical real event -- not
    at an end of the range, where the curve describes the least or most certain
    detection instead of the usual one."""
    confidences, positives = _separable(30, 60, 0.75, 0.40)
    outcome = ft._fit_one("focus.tab_hidden", confidences, positives)
    assert outcome.curve is not None, outcome.reason
    curve = outcome.curve

    expected_median = float(np.median(confidences[positives == 1]))
    assert curve.positive_confidence_median == pytest.approx(expected_median)
    assert curve.reference_llr == pytest.approx(curve.llr(expected_median))
    # It has to sit inside the supported range, or it is extrapolation too.
    assert curve.confidence_min <= curve.positive_confidence_median <= curve.confidence_max


def test_every_committed_reference_llr_is_usable_as_a_backend_magnitude() -> None:
    """The backend adopts `reference_llr` as an LLR magnitude, so it must be
    positive (evidence of misconduct, per detection.ts's sign convention) and
    inside the clamp."""
    artifact = WeightsFile.model_validate_json(
        Path(ft._DEFAULT_OUT).read_text(encoding="utf-8")
    )
    for detector_type, entry in artifact.detectors.items():
        if entry.curve is None:
            continue
        reference = entry.curve.reference_llr
        assert reference > 0, f"{detector_type} reference LLR {reference} is not evidence"
        assert reference <= STANDARD.llr_clamp_max, detector_type
