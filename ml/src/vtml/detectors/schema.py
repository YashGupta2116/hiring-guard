"""The detector type registry: one row per detector type.

Phase 1 invented 16 type strings from PRD.md section 5's prose detector
list because no registry existed yet, and duplicated them across
`priors.py` and `fusion/narrate.py`, held in sync by a guard test
(docs/Memory.md key decision, 2026-09-17). This module is the real
registry those two were standing in for: `priors.py` and
`fusion/narrate.py` now derive their dicts from `REGISTRY` below instead
of holding their own copies, and nothing else in `src/vtml/` spells a
detector type string as a literal -- `tests/test_registry.py` asserts
that.

Cross-checked against PRD.md section 5's six channel rows: every one of
the 16 types traces to a named detector in that table (gaze: offscreen
glance/persistent offscreen/fixed external focus; scene: face absent/
multiple faces; focus: tab hidden/window blur/fullscreen exit; input:
large paste/low typed ratio/burst rate/rhythm shift; network: telemetry
gap/clock anomaly/client inconsistency; audio: second voice). None of
Phase 1's provisional strings turned out to be unfounded, so nothing was
removed in this pass.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

from vtml.types import Channel

DetectorKind = Literal["interval", "point"]


class DetectorType(str, Enum):
    """Every detector type string, spelled once.

    `Observation.type` stays a plain `str` (Architecture.md section 4) so
    an unrecognised detector fails soft -- dropped and counted, never a
    validation error -- but every other reference in `src/vtml/` uses a
    member of this enum rather than the literal.
    """

    GAZE_OFFSCREEN_GLANCE = "gaze.offscreen_glance"
    GAZE_PERSISTENT_OFFSCREEN = "gaze.persistent_offscreen"
    GAZE_FIXED_EXTERNAL_FOCUS = "gaze.fixed_external_focus"
    SCENE_FACE_ABSENT = "scene.face_absent"
    SCENE_MULTIPLE_FACES = "scene.multiple_faces"
    FOCUS_TAB_HIDDEN = "focus.tab_hidden"
    FOCUS_WINDOW_BLUR = "focus.window_blur"
    FOCUS_FULLSCREEN_EXIT = "focus.fullscreen_exit"
    INPUT_LARGE_PASTE = "input.large_paste"
    INPUT_LOW_TYPED_RATIO = "input.low_typed_ratio"
    INPUT_BURST_RATE = "input.burst_rate"
    INPUT_RHYTHM_SHIFT = "input.rhythm_shift"
    NETWORK_TELEMETRY_GAP = "network.telemetry_gap"
    NETWORK_CLOCK_ANOMALY = "network.clock_anomaly"
    NETWORK_CLIENT_INCONSISTENCY = "network.client_inconsistency"
    AUDIO_SECOND_VOICE = "audio.second_voice"


@dataclass(frozen=True)
class DetectorSpec:
    type: str
    channel: Channel
    # The backend MonitoringChannel enum value this maps to on the wire
    # (wire.py, Architecture.md section 4 "Crossing into the backend"), or
    # None when the detector is deliberately absent from that contract.
    wire_channel: str | None
    kind: DetectorKind
    features: frozenset[str]
    prior: float
    template: str
    needs_baseline: bool


_T = DetectorType

REGISTRY: dict[str, DetectorSpec] = {
    spec.type: spec
    for spec in (
        # -- gaze -------------------------------------------------------
        # kind is "interval" wherever the narrative template carries a
        # duration_s clause (fusion/narrate.py) and "point" where it does
        # not -- that split already exists in the templates, so it is
        # read off them rather than re-decided here.
        DetectorSpec(
            type=_T.GAZE_OFFSCREEN_GLANCE,
            channel=Channel.GAZE,
            wire_channel="GAZE",
            kind="interval",
            features=frozenset({"yaw_deg", "pitch_deg"}),
            # A brief look away is the demo's own example of an ambiguous
            # signal (PRD section 2). It must not be evidence on its own.
            prior=0.3,
            template="Gaze left the screen region for {duration_s:.1f}s{corroboration}.",
            # Personalised: Phase 2 task 4, the yaw threshold shifts with
            # the candidate's own baseline neutral head pose.
            needs_baseline=True,
        ),
        DetectorSpec(
            type=_T.GAZE_PERSISTENT_OFFSCREEN,
            channel=Channel.GAZE,
            wire_channel="GAZE",
            kind="interval",
            features=frozenset({"yaw_deg", "pitch_deg"}),
            # Sustained time off-screen is much harder to explain as
            # "thinking".
            prior=1.4,
            template=(
                "Gaze remained off the screen region for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=True,
        ),
        DetectorSpec(
            type=_T.GAZE_FIXED_EXTERNAL_FOCUS,
            channel=Channel.GAZE,
            wire_channel="GAZE",
            kind="interval",
            features=frozenset({"yaw_deg", "pitch_deg"}),
            # A fixed external point (e.g. notes on a second screen) is
            # more specific than a glance and rarely a normal reading
            # pattern.
            prior=1.6,
            template=(
                "Gaze held a fixed point outside the screen region "
                "for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=True,
        ),
        # -- scene --------------------------------------------------------
        DetectorSpec(
            type=_T.SCENE_FACE_ABSENT,
            channel=Channel.SCENE,
            wire_channel="SCENE",
            kind="interval",
            features=frozenset({"face_count"}),
            # Camera drops and bad framing are common and innocuous on
            # their own.
            prior=1.2,
            template="No face was detected in frame for {duration_s:.1f}s{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.SCENE_MULTIPLE_FACES,
            channel=Channel.SCENE,
            wire_channel="SCENE",
            kind="interval",
            features=frozenset({"face_count"}),
            # A second person in frame is hard to explain innocently.
            prior=2.0,
            template=(
                "More than one face was detected in frame for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=False,
        ),
        # -- focus --------------------------------------------------------
        DetectorSpec(
            type=_T.FOCUS_TAB_HIDDEN,
            channel=Channel.FOCUS,
            wire_channel="FOCUS",
            kind="interval",
            features=frozenset(),
            # Leaving the exam tab is a deliberate action, not ambient
            # noise.
            prior=1.1,
            template="The exam tab was hidden for {duration_s:.1f}s{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.FOCUS_WINDOW_BLUR,
            channel=Channel.FOCUS,
            wire_channel="FOCUS",
            kind="interval",
            features=frozenset(),
            # Window blur also fires for OS notifications and alt-tab
            # reflexes.
            prior=0.6,
            template="The exam window lost focus for {duration_s:.1f}s{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.FOCUS_FULLSCREEN_EXIT,
            channel=Channel.FOCUS,
            wire_channel="FOCUS",
            kind="interval",
            features=frozenset(),
            # Exiting fullscreen is a deliberate, infrequent action.
            prior=1.3,
            template="Fullscreen mode was exited for {duration_s:.1f}s{corroboration}.",
            needs_baseline=False,
        ),
        # -- input ----------------------------------------------------------
        DetectorSpec(
            type=_T.INPUT_LARGE_PASTE,
            channel=Channel.INPUT,
            wire_channel="PASTE",
            kind="point",
            features=frozenset({"char_count"}),
            # A large paste is the strongest single-observation input
            # signal.
            prior=1.8,
            template="A large block of text was pasted{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.INPUT_LOW_TYPED_RATIO,
            channel=Channel.INPUT,
            # Measures how much of a window's content arrived by paste
            # rather than keystroke, so it rides the same wire bucket as
            # large_paste rather than the timing-pattern one.
            wire_channel="PASTE",
            kind="interval",
            features=frozenset({"typed_ratio"}),
            # A low ratio of typed-to-pasted content is suggestive but
            # not decisive.
            prior=1.0,
            template=(
                "The ratio of typed to pasted content was low "
                "for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.INPUT_BURST_RATE,
            channel=Channel.INPUT,
            wire_channel="RHYTHM",
            kind="interval",
            features=frozenset({"chars_per_sec"}),
            # Burst rate above human typing speed is unusual but happens
            # with autocomplete and IME input.
            prior=0.9,
            template="Keystrokes arrived in a rapid burst for {duration_s:.1f}s{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.INPUT_RHYTHM_SHIFT,
            channel=Channel.INPUT,
            wire_channel="RHYTHM",
            kind="interval",
            features=frozenset({"interval_ms", "chars_per_sec"}),
            # A rhythm shift from the candidate's own baseline is
            # meaningful only once corroborated -- typing rhythm varies
            # with fatigue and topic.
            prior=1.1,
            template=(
                "Typing rhythm shifted from the session baseline "
                "for {duration_s:.1f}s{corroboration}."
            ),
            # Personalised: Phase 2 task 4, a two-sample KS test against
            # the baseline inter-key interval distribution.
            needs_baseline=True,
        ),
        # -- network: zero channel weight by design, PRD section 5 --------
        DetectorSpec(
            type=_T.NETWORK_TELEMETRY_GAP,
            channel=Channel.NETWORK,
            # No backend enum value; becomes an UnscoredWindow with reason
            # SIGNAL_LOSS instead (wire.py, Architecture.md section 4).
            wire_channel=None,
            kind="interval",
            features=frozenset({"gap_ms"}),
            prior=0.5,
            template=(
                "Telemetry from the client was missing for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.NETWORK_CLOCK_ANOMALY,
            channel=Channel.NETWORK,
            wire_channel=None,
            kind="point",
            features=frozenset({"offset_ms"}),
            # Excluded from the evidence sum outright (Rules.md section 7).
            prior=0.0,
            template="The client clock diverged from the server by more than 5s{corroboration}.",
            needs_baseline=False,
        ),
        DetectorSpec(
            type=_T.NETWORK_CLIENT_INCONSISTENCY,
            channel=Channel.NETWORK,
            wire_channel=None,
            kind="point",
            features=frozenset(),
            prior=0.4,
            template="The client reported an inconsistent state{corroboration}.",
            needs_baseline=False,
        ),
        # -- audio: declared, disabled in v1, stays off the wire entirely -
        DetectorSpec(
            type=_T.AUDIO_SECOND_VOICE,
            channel=Channel.AUDIO,
            wire_channel=None,
            kind="interval",
            features=frozenset({"speaker_confidence"}),
            # Declared but disabled in v1 (PRD section 5); prior set for
            # when the channel is enabled.
            prior=2.2,
            template=(
                "A second voice was detected in the audio "
                "for {duration_s:.1f}s{corroboration}."
            ),
            needs_baseline=False,
        ),
    )
}


def get(type_: str) -> DetectorSpec | None:
    return REGISTRY.get(type_)
