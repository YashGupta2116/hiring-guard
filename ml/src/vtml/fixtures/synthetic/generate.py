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


def generate(
    profile: str, seed: int, duration_s: int = _SESSION_DEFAULT_S
) -> tuple[list[Observation], list[LabelDict]]:
    rng = np.random.default_rng(seed)
    labels: list[LabelDict] = []

    if profile == "demo":
        events, labels = _demo_events_and_labels(rng)
    else:
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
    parser.add_argument("--profile", choices=["honest", "staged", "demo"], required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--duration-s", type=int, default=_SESSION_DEFAULT_S)
    parser.add_argument("--out-dir", type=Path, default=Path("fixtures/synthetic"))
    args = parser.parse_args(argv)

    observations, labels = generate(args.profile, args.seed, args.duration_s)

    # The demo fixture is a fixed, singular artifact -- fixtures/demo_session.*,
    # not seed-suffixed like honest/staged -- since only one ever exists.
    stem = "demo_session" if args.profile == "demo" else f"{args.profile}_seed{args.seed}"
    _write_jsonl(observations, args.out_dir / f"{stem}.jsonl")
    if args.profile in ("staged", "demo"):
        _write_labels(labels, args.out_dir / f"{stem}.labels.json")


if __name__ == "__main__":
    main()