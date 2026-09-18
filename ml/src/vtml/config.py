"""EngineConfig: every constant from Rules.md section 5, in one place.

Nothing in fusion/ carries an inline number. A bare float literal in
fusion/ other than 0.0, 1.0 or 2.0 is a bug -- see Rules.md section 4.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vtml.types import Channel

_DECAY_TAU_S: dict[Channel, float] = {
    Channel.GAZE: 180.0,
    Channel.AUDIO: 300.0,
    Channel.SCENE: 240.0,
    Channel.FOCUS: 300.0,
    Channel.INPUT: 420.0,
    Channel.NETWORK: 120.0,
}

_CHANNEL_WEIGHT: dict[Channel, float] = {
    Channel.GAZE: 1.0,
    Channel.AUDIO: 1.25,
    Channel.SCENE: 1.15,
    Channel.FOCUS: 1.1,
    Channel.INPUT: 0.9,
    # Zero by design, not a placeholder: a dropped connection or clock skew
    # is a data-quality note to the reviewer, never a penalty. PRD section 5.
    Channel.NETWORK: 0.0,
}


@dataclass(frozen=True)
class EngineConfig:
    """Every fusion constant from Rules.md section 5, and nowhere else."""

    llr_clamp_min: float = -1.0
    llr_clamp_max: float = 4.0

    # duration scaling is log-saturating: see Rules.md section 5 for the
    # formula. duration_scale_ms is d0, duration_saturation_ms is d_sat.
    duration_scale_ms: float = 1500.0
    duration_saturation_ms: float = 20000.0

    decay_tau_s: dict[Channel, float] = field(default_factory=lambda: dict(_DECAY_TAU_S))

    corroboration_window_ms: int = 6000
    corroboration_boost_step: float = 0.45
    corroboration_boost_cap: float = 2.35
    same_channel_damping: float = 0.6

    channel_weight: dict[Channel, float] = field(default_factory=lambda: dict(_CHANNEL_WEIGHT))

    score_midpoint: float = 2.2
    score_slope: float = 1.6

    flag_threshold: float = 0.8
    severity_low_max: float = 1.5
    severity_medium_max: float = 3.0
    merge_window_ms: int = 15000

    calibration_window_s: float = 60.0
    # Structural buffer length for ChannelState.recent, not a Rules.md
    # section 5 scoring constant, but it lives here per Rules.md section 4.
    evidence_ring_buffer_ms: int = 60000
    decay_tick_ms: int = 200

    # Integrity band boundaries -- Design.md section 1, shared with the
    # product gauge. clear 85-100, review 70-84, suppressed below 70.
    band_clear_min: float = 85.0
    band_review_min: float = 70.0

    # The sigmoid's numerator, and the score an untouched session starts
    # at. Not in Rules.md section 5, but every module reads it from here
    # rather than inlining 100.0 -- see Rules.md section 4.
    score_scale: float = 100.0
    initial_score: float = 100.0

    # Halves a downgraded flag's contribution in Engine.recompute. Not in
    # Rules.md section 5; Architecture.md names `downgraded_ids` without
    # a factor. Flagged as a Phase 1 assumption in docs/Memory.md.
    downgrade_factor: float = 0.5

    # -- Phase 2 personalised thresholds, task 4 -----------------------
    # A gaze sample within this many degrees of the candidate's own
    # baseline neutral yaw is their normal resting angle, not a glance
    # off-screen -- someone who sits at an angle to their camera is not
    # permanently looking away. Not in Rules.md section 5 at the time of
    # writing; recorded there in this phase alongside the KS constants.
    gaze_personalised_yaw_threshold_deg: float = 15.0

    # Rhythm anomaly: two-sample KS test against the baseline interval
    # distribution over a sliding window, flagged only when all three
    # hold. Rules.md section 5, added this phase.
    rhythm_window_s: float = 30.0
    rhythm_ks_d_threshold: float = 0.35
    rhythm_ks_p_threshold: float = 0.01
    rhythm_burst_rate_threshold: float = 8.0

    # Baseline sufficiency, baseline.py: below these counts a signal
    # falls back to the population default even once the full 60 s
    # calibration window has elapsed -- a quiet window means no data,
    # not bad data. See baseline.py for the reasoning on each.
    baseline_min_gaze_samples: int = 5
    baseline_min_keystroke_samples: int = 10


STANDARD = EngineConfig(score_midpoint=2.2)
LENIENT = EngineConfig(score_midpoint=3.2)
STRICT = EngineConfig(score_midpoint=1.5)
