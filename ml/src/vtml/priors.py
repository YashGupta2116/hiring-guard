"""Hand-set LLR priors, one entry per detector type from PRD.md section 5.

This is the fallback when a detector has too few labelled examples to fit
a calibration curve (Architecture.md section 3). In Phase 0/1, every
detector is on its prior -- no curve has been fitted yet.

Each prior is the LLR for a single observation at the duration baseline
(config.duration_scale_ms), before duration scaling or corroboration.
"""

from __future__ import annotations

PRIORS: dict[str, float] = {
    # A brief look away is the demo's own example of an ambiguous signal --
    # PRD section 2. It must not be evidence on its own.
    "gaze.offscreen_glance": 0.3,
    # Sustained time off-screen is much harder to explain as "thinking".
    "gaze.persistent_offscreen": 1.4,
    # A fixed external point (e.g. notes on a second screen) is more
    # specific than a glance and rarely a normal reading pattern.
    "gaze.fixed_external_focus": 1.6,
    # Camera drops and bad framing are common and innocuous on their own.
    "scene.face_absent": 1.2,
    # A second person in frame is hard to explain innocently.
    "scene.multiple_faces": 2.0,
    # Leaving the exam tab is a deliberate action, not ambient noise.
    "focus.tab_hidden": 1.1,
    # Window blur also fires for OS notifications and alt-tab reflexes.
    "focus.window_blur": 0.6,
    # Exiting fullscreen is a deliberate, infrequent action.
    "focus.fullscreen_exit": 1.3,
    # A large paste is the strongest single-observation input signal.
    "input.large_paste": 1.8,
    # A low ratio of typed-to-pasted content is suggestive but not decisive.
    "input.low_typed_ratio": 1.0,
    # Burst rate above human typing speed is unusual but happens with
    # autocomplete and IME input.
    "input.burst_rate": 0.9,
    # A rhythm shift from the candidate's own baseline is meaningful only
    # once corroborated -- typing rhythm varies with fatigue and topic.
    "input.rhythm_shift": 1.1,
    # network carries zero channel weight by design (PRD section 5); the
    # prior exists so the detector registry is complete, not because it
    # scores anything.
    "network.telemetry_gap": 0.5,
    # Excluded from the evidence sum outright (Rules.md section 7).
    "network.clock_anomaly": 0.0,
    "network.client_inconsistency": 0.4,
    # Declared but disabled in v1 (PRD section 5); needs server-side speaker
    # embeddings we don't have. Prior set for when the channel is enabled.
    "audio.second_voice": 2.2,
}
