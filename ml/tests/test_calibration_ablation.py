"""Tests for the calibration-window ablation (evaluate/calibration_ablation.py).

Pins the ablation's four numbers and two observation counts to the values
actually measured this session, cross-checked against docs/Memory.md's
2026-09-18 entry for the same fix. If any of these move, the fusion
constants or the fixtures changed -- this test exists to catch that, not
to be relaxed to match a new number.
"""

from __future__ import annotations

from vtml.evaluate.calibration_ablation import run_ablation


def test_condition_a_matches_the_shipped_pinned_baseline() -> None:
    results = {r.fixture: r for r in run_ablation()}
    assert results["honest_seed7"].condition_a_score == 94.28386762280083
    assert results["staged_seed7"].condition_a_score == 2.350196740204917


def test_condition_b_reproduces_the_documented_pre_fix_score() -> None:
    """docs/Memory.md, Key decisions (2026-09-18): before the fix, honest
    scored 93.11 and staged scored 1.93 (both rounded there to 2 places).
    """
    results = {r.fixture: r for r in run_ablation()}
    assert round(results["honest_seed7"].condition_b_score, 2) == 93.11
    assert round(results["staged_seed7"].condition_b_score, 2) == 1.93


def test_five_of_sixteen_honest_observations_sit_inside_the_calibration_window() -> None:
    """The handoff's claim, verified: docs/Memory.md independently records
    the same five timestamps (t=12425, 13251, 28855, 40939, 52802)."""
    results = {r.fixture: r for r in run_ablation()}
    honest = results["honest_seed7"]
    assert honest.observations_in_window == 5
    assert honest.observations_total == 16


def test_staged_fixture_also_has_observations_inside_the_window() -> None:
    results = {r.fixture: r for r in run_ablation()}
    staged = results["staged_seed7"]
    assert staged.observations_in_window == 5
    assert staged.observations_total == 20


def test_condition_a_scores_higher_than_condition_b_on_both_fixtures() -> None:
    """Discarding in-window evidence can only remove suspicion, never add
    it (docs/Memory.md) -- the shipped fix must never score lower than
    the defect it replaced."""
    for result in run_ablation():
        assert result.condition_a_score >= result.condition_b_score
