"""Deterministic synthetic Observation stream generator.

Honest sessions carry only low-confidence background noise. Staged
sessions carry that same noise plus a scripted event list at known
timestamps, written alongside the stream as a label file so later phases
can consume synthetic and real fixtures the same way.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from vtml.detectors.schema import DetectorType
from vtml.types import Channel, Observation, Source

# An in-flight event before it becomes an Observation. Values are mixed
# (int timestamps, Channel enums, float confidences, optional durations),
# so this stays loose by necessity.
EventDict = dict[str, Any]

# A ground-truth label for a staged event: integer bounds plus a type string.
LabelDict = dict[str, int | str]

_SESSION_DEFAULT_S = 180
_GLANCE_INTERVAL_S = 20.0
_BLUR_INTERVAL_S = 35.0

# -- golden fixtures (Rules.md section 8) -----------------------------------
# Three named sessions that replay to a committed SessionResult, so a change
# to any fusion constant shows up as a diff in the expected output rather
# than as a number nobody re-checked.
GOLDEN_SESSION_S = 300
GOLDEN_SEED = 11
# -- calibration set (Phase 3, fitted on synthetic) ------------------------
# A curve over raw confidence is only identifiable if confidence varies and
# actually tracks the truth. The honest/staged/demo fixtures pin one fixed
# confidence per scripted event type, which is right for a regression fixture
# and useless for a fit: every positive sits at one x, so the slope is
# unbounded. This profile models what a detector really does instead -- high
# confidence when the event is there, low confidence when it misfires -- so
# the fit has something to separate, and the separation is a property of the
# data rather than of the fitter.
_CALIBRATION_CONFIDENCE_SD = 0.08
# Misfires: the same detector types firing outside every labelled window. They
# are the negatives that give the curve its lower end.
_CALIBRATION_MISFIRES_PER_TYPE = 3
# A detector has a reporting floor -- below some confidence it emits nothing at
# all rather than an observation saying "almost certainly not an event". The
# floor matters to the fit: negatives drawn from arbitrarily low confidence
# make the fitted curve steep enough to leave the LLR clamp at its bottom end
# (an LLR of -1.4 reads as active evidence the candidate is clean), which
# calibrate/fit.py then rejects. 0.25 is the repo's existing ambient-noise
# floor rounded up (_honest_noise draws glances from 0.15); the rejection path
# it stays clear of is exercised directly in tests/test_calibrate.py.
_CALIBRATION_MISFIRE_CONFIDENCE = (0.25, 0.50)

GOLDEN_PROFILES: tuple[str, ...] = (
    "honest_clean",
    "honest_noisy_camera",
    "staged_phone_and_glance",
)

# honest_noisy_camera: bad webcam, poor lighting, flaky connection. The face
# detector loses the face regularly and telemetry drops out -- an honest
# candidate on cheap hardware. Rules.md section 8 requires this session to
# score above 85: if equipment quality reads as evidence, the false-positive
# behaviour is broken whatever the other metrics say.
# Sub-second runs, not multi-second ones: a backlit or low-light webcam loses
# the face for a few frames and recovers. A face genuinely absent for seconds
# is a person leaving the frame, which is a different session and a different
# fixture -- folding it in here would make this test pass or fail on an event
# it is not about.
_NOISY_FACE_ABSENT_INTERVAL_S = 50.0
_NOISY_FACE_ABSENT_MIN_MS = 250
_NOISY_FACE_ABSENT_MAX_MS = 800
_NOISY_GAP_INTERVAL_S = 47.0

# staged_phone_and_glance: the phone is off-screen, so it is never a face in
# frame -- it reads as gaze held on a fixed point outside the screen region,
# with the face lost as the head drops to it. The pair lands inside the 6s
# corroboration window; the glance before it is the ambiguous signal that
# must not flag on its own.
_STAGED_GLANCE_T_MS = 95_000
_STAGED_PHONE_T_MS = 150_000
_STAGED_FACE_ABSENT_T_MS = 153_000
_STAGED_PASTE_T_MS = 240_000

# t_start_ms, duration_ms, channel, type, confidence. Two events five
# seconds apart (gaze, scene) so a staged session also exercises
# cross-channel corroboration, per PRD section 5.
_STAGED_SCRIPT: list[tuple[int, int | None, Channel, str, float]] = [
    (60_000, 8_000, Channel.GAZE, DetectorType.GAZE_PERSISTENT_OFFSCREEN, 0.85),
    (65_000, 5_000, Channel.SCENE, DetectorType.SCENE_MULTIPLE_FACES, 0.80),
    (120_000, None, Channel.INPUT, DetectorType.INPUT_LARGE_PASTE, 0.90),
    (150_000, 4_000, Channel.FOCUS, DetectorType.FOCUS_TAB_HIDDEN, 0.75),
]

# Phase 6: the demo session's fixed beat schedule, compressed from
# Phases.md's original 12-minute arc to roughly 4 minutes per the Phase 6
# handoff -- a 12-minute session at 10x is two minutes of replay, most of
# a video's budget spent watching a line move. Exported (no leading
# underscore) so replay.py and evaluate/__main__.py's demo timeline drive
# the identical driver-action schedule rather than each guessing at it --
# "keep that schedule in one place" per the handoff.
_DEMO_CALIBRATION_S = 60
DEMO_CALIBRATION_CHECK_T_MS = 30_000
DEMO_GLANCE_T_MS = 90_000
DEMO_CORROBORATION_GAZE_T_MS = 135_000
DEMO_CORROBORATION_SCENE_T_MS = 138_000
DEMO_DISMISSAL_T_MS = 165_000
DEMO_SUPPRESS_T_MS = 195_000
DEMO_RESUME_T_MS = 225_000
DEMO_SESSION_END_MS = 240_000
DEMO_SUPPRESS_CHANNEL = Channel.GAZE
DEMO_SUPPRESS_REASON = "camera_dropped"

# Durations chosen so the lone glance stays well under the flag threshold
# (0.8) alone, the corroborating gaze event stays under it alone too, and
# only the scene event -- boosted by the gaze evidence still inside the
# 6s corroboration window -- crosses it, landing in the medium band.
_DEMO_SCRIPT: list[tuple[int, int | None, Channel, str, float]] = [
    (DEMO_GLANCE_T_MS, 3_000, Channel.GAZE, DetectorType.GAZE_OFFSCREEN_GLANCE, 0.32),
    (DEMO_CORROBORATION_GAZE_T_MS, 4_000, Channel.GAZE, DetectorType.GAZE_PERSISTENT_OFFSCREEN, 0.85),
    (DEMO_CORROBORATION_SCENE_T_MS, 5_000, Channel.SCENE, DetectorType.SCENE_MULTIPLE_FACES, 0.80),
]


def _detector_name(channel: Channel) -> str:
    return f"synthetic.{channel.value}@1.0.0"


def _honest_noise(rng: np.random.Generator, duration_s: int) -> list[EventDict]:
    events: list[EventDict] = []

    t = float(rng.uniform(2.0, _GLANCE_INTERVAL_S))
    while t < duration_s:
        events.append(
            {
                "t_ms": int(t * 1000),
                "channel": Channel.GAZE,
                "type": DetectorType.GAZE_OFFSCREEN_GLANCE,
                "confidence": float(rng.uniform(0.15, 0.35)),
                "duration_ms": int(rng.uniform(200, 700)),
            }
        )
        t += float(rng.uniform(_GLANCE_INTERVAL_S * 0.6, _GLANCE_INTERVAL_S * 1.4))

    t = float(rng.uniform(5.0, _BLUR_INTERVAL_S))
    while t < duration_s:
        events.append(
            {
                "t_ms": int(t * 1000),
                "channel": Channel.FOCUS,
                "type": DetectorType.FOCUS_WINDOW_BLUR,
                "confidence": float(rng.uniform(0.15, 0.30)),
                "duration_ms": int(rng.uniform(200, 750)),
            }
        )
        t += float(rng.uniform(_BLUR_INTERVAL_S * 0.6, _BLUR_INTERVAL_S * 1.4))

    return events


def _staged_events_and_labels() -> tuple[list[EventDict], list[LabelDict]]:
    events: list[EventDict] = [
        {
            "t_ms": t_start,
            "channel": channel,
            "type": type_,
            "confidence": confidence,
            "duration_ms": duration,
        }
        for t_start, duration, channel, type_, confidence in _STAGED_SCRIPT
    ]
    labels: list[LabelDict] = [
        {"t_start_ms": t_start, "t_end_ms": t_start + (duration or 0), "event_type": type_}
        for t_start, duration, _channel, type_, _confidence in _STAGED_SCRIPT
    ]
    return events, labels


def _demo_events_and_labels(rng: np.random.Generator) -> tuple[list[EventDict], list[LabelDict]]:
    # Ambient noise only during the calibration window, per the handoff:
    # visible on the evidence track, hatched out, scoring nothing. Nothing
    # after it but the three scripted observations, so the score arc stays
    # legible on a chart without narration (Phases.md Phase 6 exit
    # criteria) instead of getting lost in random background wiggle.
    events = _honest_noise(rng, _DEMO_CALIBRATION_S)
    events.extend(
        {
            "t_ms": t_start,
            "channel": channel,
            "type": type_,
            "confidence": confidence,
            "duration_ms": duration,
        }
        for t_start, duration, channel, type_, confidence in _DEMO_SCRIPT
    )
    labels: list[LabelDict] = [
        {"t_start_ms": t_start, "t_end_ms": t_start + (duration or 0), "event_type": type_}
        for t_start, duration, _channel, type_, _confidence in _DEMO_SCRIPT
    ]
    # The dismissal and the signal loss are driver actions, not
    # observations (replay.py holds the schedule that fires them), but
    # they are still scripted beats -- ground truth for the walkthrough
    # the same way a detector event's label is.
    labels.append(
        {"t_start_ms": DEMO_DISMISSAL_T_MS, "t_end_ms": DEMO_DISMISSAL_T_MS, "event_type": "dismissal"}
    )
    labels.append(
        {"t_start_ms": DEMO_SUPPRESS_T_MS, "t_end_ms": DEMO_RESUME_T_MS, "event_type": "signal_loss"}
    )
    return events, labels


def _noisy_camera_events(rng: np.random.Generator, duration_s: int) -> list[EventDict]:
    """Honest background noise plus the artifacts of bad equipment.

    Face-absent runs stay short: a webcam losing the face to backlighting
    recovers within a second or so, unlike someone leaving the frame. The
    telemetry gaps are scored at the network channel's weight, which is 0.0
    by design (PRD section 5), so a dropped connection costs nothing -- they
    are here because the session has to survive carrying them, not because
    they move the number.
    """
    events = _honest_noise(rng, duration_s)

    t = float(rng.uniform(5.0, _NOISY_FACE_ABSENT_INTERVAL_S))
    while t < duration_s:
        events.append(
            {
                "t_ms": int(t * 1000),
                "channel": Channel.SCENE,
                "type": DetectorType.SCENE_FACE_ABSENT,
                "confidence": float(rng.uniform(0.20, 0.45)),
                "duration_ms": int(
                    rng.uniform(_NOISY_FACE_ABSENT_MIN_MS, _NOISY_FACE_ABSENT_MAX_MS)
                ),
            }
        )
        t += float(rng.uniform(_NOISY_FACE_ABSENT_INTERVAL_S * 0.6, _NOISY_FACE_ABSENT_INTERVAL_S * 1.4))

    t = float(rng.uniform(10.0, _NOISY_GAP_INTERVAL_S))
    while t < duration_s:
        events.append(
            {
                "t_ms": int(t * 1000),
                "channel": Channel.NETWORK,
                "type": DetectorType.NETWORK_TELEMETRY_GAP,
                "confidence": float(rng.uniform(0.40, 0.80)),
                "duration_ms": int(rng.uniform(1_200, 4_000)),
            }
        )
        t += float(rng.uniform(_NOISY_GAP_INTERVAL_S * 0.6, _NOISY_GAP_INTERVAL_S * 1.4))

    return events


def _phone_and_glance_events_and_labels(
    rng: np.random.Generator, duration_s: int
) -> tuple[list[EventDict], list[LabelDict]]:
    script: list[tuple[int, int | None, Channel, str, float]] = [
        (_STAGED_GLANCE_T_MS, 2_500, Channel.GAZE, DetectorType.GAZE_OFFSCREEN_GLANCE, 0.34),
        (_STAGED_PHONE_T_MS, 9_000, Channel.GAZE, DetectorType.GAZE_FIXED_EXTERNAL_FOCUS, 0.88),
        (_STAGED_FACE_ABSENT_T_MS, 6_000, Channel.SCENE, DetectorType.SCENE_FACE_ABSENT, 0.82),
        (_STAGED_PASTE_T_MS, None, Channel.INPUT, DetectorType.INPUT_LARGE_PASTE, 0.91),
    ]
    events = _honest_noise(rng, duration_s)
    events.extend(
        {
            "t_ms": t_start,
            "channel": channel,
            "type": type_,
            "confidence": confidence,
            "duration_ms": duration,
        }
        for t_start, duration, channel, type_, confidence in script
    )
    labels: list[LabelDict] = [
        {"t_start_ms": t_start, "t_end_ms": t_start + (duration or 0), "event_type": type_}
        for t_start, duration, _channel, type_, _confidence in script
    ]
    return events, labels


def _calibration_events_and_labels(
    rng: np.random.Generator, duration_s: int
) -> tuple[list[EventDict], list[LabelDict]]:
    """One staged session with jittered confidences plus detector misfires.

    The scripted events keep `_STAGED_SCRIPT`'s types, timings and durations --
    the ground truth is the script, exactly as in a recorded session -- and
    vary only in confidence. The misfires carry the same detector types at low
    confidence, placed away from every scripted window so the joiner reads them
    as negatives without needing to know they were planted.
    """
    events = _honest_noise(rng, duration_s)
    labels: list[LabelDict] = []

    scripted_spans: list[tuple[int, int]] = []
    for t_start, duration, channel, type_, confidence in _STAGED_SCRIPT:
        events.append(
            {
                "t_ms": t_start,
                "channel": channel,
                "type": type_,
                "confidence": float(
                    np.clip(rng.normal(confidence, _CALIBRATION_CONFIDENCE_SD), 0.0, 1.0)
                ),
                "duration_ms": duration,
            }
        )
        labels.append(
            {"t_start_ms": t_start, "t_end_ms": t_start + (duration or 0), "event_type": type_}
        )
        scripted_spans.append((t_start, t_start + (duration or 0)))

    # Keep a misfire clear of every scripted window by more than the joiner's
    # match tolerance, or it would be labelled a positive for the wrong reason.
    clearance_ms = 10_000

    def far_from_scripted(t_ms: int) -> bool:
        return all(
            t_ms + clearance_ms < start or t_ms - clearance_ms > end
            for start, end in scripted_spans
        )

    for _t_start, duration, channel, type_, _confidence in _STAGED_SCRIPT:
        placed = 0
        attempts = 0
        while placed < _CALIBRATION_MISFIRES_PER_TYPE and attempts < 200:
            attempts += 1
            t_ms = int(rng.uniform(_DEMO_CALIBRATION_S * 1000, duration_s * 1000))
            if not far_from_scripted(t_ms):
                continue
            events.append(
                {
                    "t_ms": t_ms,
                    "channel": channel,
                    "type": type_,
                    "confidence": float(rng.uniform(*_CALIBRATION_MISFIRE_CONFIDENCE)),
                    "duration_ms": duration,
                }
            )
            placed += 1

    return events, labels


def generate(
    profile: str, seed: int, duration_s: int = _SESSION_DEFAULT_S
) -> tuple[list[Observation], list[LabelDict]]:
    rng = np.random.default_rng(seed)
    labels: list[LabelDict] = []

    if profile == "demo":
        events, labels = _demo_events_and_labels(rng)
    elif profile == "honest_noisy_camera":
        events = _noisy_camera_events(rng, duration_s)
    elif profile == "staged_phone_and_glance":
        events, labels = _phone_and_glance_events_and_labels(rng, duration_s)
    elif profile == "staged_calibration":
        events, labels = _calibration_events_and_labels(rng, duration_s)
    else:
        # "honest", and "honest_clean" -- the golden fixture's name for the
        # same profile, so the three goldens read as a set in fixtures/golden/.
        events = _honest_noise(rng, duration_s)
        if profile == "staged":
            staged_events, labels = _staged_events_and_labels()
            events.extend(staged_events)

    events.sort(key=lambda e: e["t_ms"])

    observations = [
        Observation(
            seq=seq,
            t_ms=event["t_ms"],
            channel=event["channel"],
            type=event["type"],
            confidence=event["confidence"],
            duration_ms=event["duration_ms"],
            features={},
            detector=_detector_name(event["channel"]),
            source=Source.SYNTHETIC,
        )
        for seq, event in enumerate(events)
    ]
    return observations, labels


def _write_jsonl(observations: list[Observation], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for obs in observations:
            f.write(obs.model_dump_json())
            f.write("\n")


def _write_labels(labels: list[LabelDict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(labels, f, indent=2)
        f.write("\n")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic Observation fixture.")
    parser.add_argument(
        "--profile",
        choices=[
            "honest",
            "staged",
            "demo",
            "honest_clean",
            "honest_noisy_camera",
            "staged_phone_and_glance",
            "staged_calibration",
        ],
        required=True,
    )
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--duration-s", type=int, default=_SESSION_DEFAULT_S)
    parser.add_argument("--out-dir", type=Path, default=Path("fixtures/synthetic"))
    args = parser.parse_args(argv)

    observations, labels = generate(args.profile, args.seed, args.duration_s)

    # The demo fixture is a fixed, singular artifact -- fixtures/demo_session.*,
    # not seed-suffixed like honest/staged -- since only one ever exists.
    if args.profile == "demo":
        stem = "demo_session"
    elif args.profile in GOLDEN_PROFILES:
        stem = args.profile
    else:
        stem = f"{args.profile}_seed{args.seed}"
    _write_jsonl(observations, args.out_dir / f"{stem}.jsonl")
    if labels:
        _write_labels(labels, args.out_dir / f"{stem}.labels.json")


if __name__ == "__main__":
    main()