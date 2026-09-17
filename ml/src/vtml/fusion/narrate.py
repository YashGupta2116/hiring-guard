"""One narrative template per detector type.

Templates state what was observed, never what it implies -- PRD.md
section 9 rule 4. Rules.md section 6 rule 4 bans a fixed word list;
tests/test_ethics.py asserts none of them appear in any template.
"""

from __future__ import annotations

from vtml.types import Channel

TEMPLATES: dict[str, str] = {
    "gaze.offscreen_glance": "Gaze left the screen region for {duration_s:.1f}s{corroboration}.",
    "gaze.persistent_offscreen": (
        "Gaze remained off the screen region for {duration_s:.1f}s{corroboration}."
    ),
    "gaze.fixed_external_focus": (
        "Gaze held a fixed point outside the screen region for {duration_s:.1f}s{corroboration}."
    ),
    "scene.face_absent": "No face was detected in frame for {duration_s:.1f}s{corroboration}.",
    "scene.multiple_faces": (
        "More than one face was detected in frame for {duration_s:.1f}s{corroboration}."
    ),
    "focus.tab_hidden": "The exam tab was hidden for {duration_s:.1f}s{corroboration}.",
    "focus.window_blur": "The exam window lost focus for {duration_s:.1f}s{corroboration}.",
    "focus.fullscreen_exit": "Fullscreen mode was exited for {duration_s:.1f}s{corroboration}.",
    "input.large_paste": "A large block of text was pasted{corroboration}.",
    "input.low_typed_ratio": (
        "The ratio of typed to pasted content was low for {duration_s:.1f}s{corroboration}."
    ),
    "input.burst_rate": "Keystrokes arrived in a rapid burst for {duration_s:.1f}s{corroboration}.",
    "input.rhythm_shift": (
        "Typing rhythm shifted from the session baseline for {duration_s:.1f}s{corroboration}."
    ),
    "network.telemetry_gap": (
        "Telemetry from the client was missing for {duration_s:.1f}s{corroboration}."
    ),
    "network.clock_anomaly": (
        "The client clock diverged from the server by more than 5s{corroboration}."
    ),
    "network.client_inconsistency": "The client reported an inconsistent state{corroboration}.",
    "audio.second_voice": (
        "A second voice was detected in the audio for {duration_s:.1f}s{corroboration}."
    ),
}

BANNED_WORDS = (
    "cheat",
    "cheating",
    "dishonest",
    "suspicious",
    "guilty",
    "caught",
    "violation",
    "misconduct",
    "lying",
    "fraud",
)


def _corroboration_clause(corroborated_by: list[Channel]) -> str:
    if not corroborated_by:
        return ""
    names = ", ".join(c.value for c in corroborated_by)
    return f", corroborated by {names}"


def narrate(type_: str, duration_ms: int | None, corroborated_by: list[Channel]) -> str:
    template = TEMPLATES[type_]
    duration_s = (duration_ms or 0) / 1000
    clause = _corroboration_clause(corroborated_by)
    return template.format(duration_s=duration_s, corroboration=clause)
