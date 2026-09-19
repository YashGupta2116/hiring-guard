"""Tests for the prior-sensitivity sweep (evaluate/priors_sweep.py).

The handoff's own required checks, as real tests rather than a manual
run: the priors override cannot leak between Engine instances, the sweep
is deterministic, and the stability statistic excludes an unexercised
channel (audio) from its headline rather than crediting it as stable.
"""

from __future__ import annotations

from vtml.config import STANDARD
from vtml.detectors.schema import REGISTRY as DETECTOR_REGISTRY
from vtml.evaluate.priors_sweep import (
    MULTIPLIERS,
    SWEPT_CHANNELS,
    narrowest_exercised,
    run_sweep,
    scaled_priors,
    stability_statistic,
)
from vtml.fusion.engine import Engine, Weights
from vtml.priors import PRIORS
from vtml.types import Channel


def test_multiplier_of_one_changes_nothing() -> None:
    for channel in SWEPT_CHANNELS:
        overrides, clamped = scaled_priors(channel, 1.0)
        assert overrides == PRIORS
        assert clamped is False


def test_overriding_one_engine_does_not_leak_into_the_next() -> None:
    """Two Engine instances constructed with different priors overrides,
    back to back, must not see each other's values -- each instance
    copies its own dict at construction (fusion/engine.py), so nothing
    is shared to leak through."""
    overrides_a, _ = scaled_priors(Channel.GAZE, 4.0)
    engine_a = Engine(STANDARD, Weights(), priors=overrides_a)
    assert engine_a._priors is not PRIORS
    assert engine_a._priors["gaze.offscreen_glance"] == PRIORS["gaze.offscreen_glance"] * 4.0

    engine_default = Engine(STANDARD, Weights())
    assert engine_default._priors is PRIORS
    assert engine_default._priors["gaze.offscreen_glance"] == PRIORS["gaze.offscreen_glance"]


def test_sweep_is_deterministic() -> None:
    first = run_sweep()
    second = run_sweep()
    assert first == second


def test_sweep_covers_every_scored_channel_at_least_once() -> None:
    points = run_sweep()
    assert len(points) == len(SWEPT_CHANNELS) * len(MULTIPLIERS)
    assert {p.channel for p in points} == set(SWEPT_CHANNELS)


def test_network_is_excluded_because_it_carries_zero_channel_weight() -> None:
    # config.py: channel_weight[NETWORK] == 0.0 by design (PRD.md section
    # 5) -- no multiplier on its prior can move the score, so it is not a
    # "scored" channel and does not belong in the sweep.
    assert Channel.NETWORK not in SWEPT_CHANNELS
    assert {spec.channel for spec in DETECTOR_REGISTRY.values()} == set(Channel)


def test_audio_is_excluded_from_the_headline_because_it_is_untested_not_stable() -> None:
    """audio is declared but disabled in v1 (PRD.md section 5): neither
    fixture ever produces an audio observation, so every multiplier is a
    no-op. A no-op must not win the narrowest-channel headline by
    default -- it must not even be counted as a pass."""
    results = stability_statistic(run_sweep())
    audio_result = next(r for r in results if r.channel == Channel.AUDIO)
    assert audio_result.exercised is False

    headline = narrowest_exercised(results)
    assert headline.channel != Channel.AUDIO
    assert headline.exercised is True


def test_focus_is_the_narrowest_exercised_channel() -> None:
    """Pinned to the actual measured result (2026-09-18): four of five
    scored channels hold both verdicts across the full 0.25x-4x sweep;
    focus breaks at 4x, where the honest fixture's own ambient noise
    pushes the score out of the clear band. If this ever changes, the
    fusion constants moved, not just this test."""
    results = stability_statistic(run_sweep())
    assert narrowest_exercised(results).channel == Channel.FOCUS
    focus = next(r for r in results if r.channel == Channel.FOCUS)
    assert focus.widest_range == (MULTIPLIERS[0], MULTIPLIERS[7])
