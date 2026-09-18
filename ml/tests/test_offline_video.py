"""Tests for detectors/offline_video.py against a synthesised frame
sequence -- no recorded mp4 fixture is available in this repo, so the
handoff's fallback applies: exercise the frame-to-Observation pipeline
directly rather than skip the module.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from vtml.detectors.offline_video import observations_from_frames
from vtml.detectors.schema import DetectorType
from vtml.types import Channel


@dataclass
class _Reading:
    face_count: int
    yaw_deg: float | None
    pitch_deg: float | None


class _ScriptedReader:
    """A FaceReader stand-in: no MediaPipe model, no video file -- just a
    canned reading per frame, in call order."""

    def __init__(self, readings: list[_Reading]) -> None:
        self._readings = iter(readings)

    def read(self, frame_rgb: np.ndarray) -> _Reading:
        return next(self._readings)


def _blank_frames(n: int, step_ms: int = 200) -> Iterator[tuple[int, np.ndarray]]:
    blank = np.zeros((2, 2, 3), dtype=np.uint8)
    for i in range(n):
        yield i * step_ms, blank


def test_scene_and_gaze_runs_become_observations() -> None:
    readings = (
        [_Reading(face_count=1, yaw_deg=0.0, pitch_deg=0.0) for _ in range(3)]
        + [_Reading(face_count=0, yaw_deg=0.0, pitch_deg=0.0) for _ in range(3)]
        + [_Reading(face_count=1, yaw_deg=30.0, pitch_deg=0.0) for _ in range(4)]
    )
    observations = observations_from_frames(
        _blank_frames(len(readings)), _ScriptedReader(readings)
    )

    assert len(observations) == 2
    scene, gaze = observations

    assert scene.channel == Channel.SCENE
    assert scene.type == DetectorType.SCENE_FACE_ABSENT.value
    assert scene.t_ms == 600
    assert scene.duration_ms == 400
    assert scene.features["face_count"] == 0.0

    assert gaze.channel == Channel.GAZE
    assert gaze.type == DetectorType.GAZE_OFFSCREEN_GLANCE.value  # 600ms, below persistent
    assert gaze.t_ms == 1200
    assert gaze.duration_ms == 600
    assert gaze.features["yaw_deg"] == 30.0

    assert [o.seq for o in observations] == [0, 1]


def test_sustained_offscreen_run_is_persistent_not_a_glance() -> None:
    readings = [_Reading(face_count=1, yaw_deg=45.0, pitch_deg=5.0) for _ in range(30)]
    observations = observations_from_frames(
        _blank_frames(len(readings), step_ms=200), _ScriptedReader(readings)
    )
    assert len(observations) == 1
    assert observations[0].type == DetectorType.GAZE_PERSISTENT_OFFSCREEN.value
    assert observations[0].duration_ms == 200 * (len(readings) - 1)


def test_multiple_faces_uses_multiple_faces_type() -> None:
    readings = [_Reading(face_count=2, yaw_deg=0.0, pitch_deg=0.0) for _ in range(3)]
    observations = observations_from_frames(_blank_frames(3), _ScriptedReader(readings))
    assert len(observations) == 1
    assert observations[0].type == DetectorType.SCENE_MULTIPLE_FACES.value


def test_no_events_when_gaze_and_face_stay_normal() -> None:
    readings = [_Reading(face_count=1, yaw_deg=2.0, pitch_deg=1.0) for _ in range(10)]
    observations = observations_from_frames(_blank_frames(10), _ScriptedReader(readings))
    assert observations == []


def test_seq_start_offsets_sequence_numbers() -> None:
    readings = [_Reading(face_count=0, yaw_deg=None, pitch_deg=None) for _ in range(2)]
    observations = observations_from_frames(
        _blank_frames(2), _ScriptedReader(readings), seq_start=50
    )
    assert [o.seq for o in observations] == [50]
