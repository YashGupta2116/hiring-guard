"""MediaPipe Python over a recorded mp4, emitting the same `Observation`
shapes the browser's MediaPipe Tasks for Web path will (Architecture.md
sections 6-7). This exists so Phase 3 can generate fixture observations
from recorded video instead of only synthetic noise.

Dev-only: `mediapipe` and `opencv-python-headless` are dev dependencies
(Rules.md section 3), and this module is on the import-boundary
exclusion list `tests/test_runtime_deps.py` enforces in Phase 5 -- the
runtime path (`handler.py`, `fusion/`, `ingest.py`, `baseline.py`) never
imports it, so importing this module is never a cold-start or bundle-size
cost for the Lambda.

The `FaceReader` that actually runs MediaPipe inference is supplied by
the caller rather than constructed in this module: the Tasks API needs a
`.task` model bundle on disk, and fetching one over the network is not
this module's job (Rules.md section 4 -- no network calls from
`src/vtml` outside `handler.py`, and this is dev tooling, not even that).
`run()` takes anything shaped like `FaceReader`, so the frame-to-
Observation pipeline is testable against a synthesised frame sequence
without a real model or a real video.

The browser's own threshold logic (when a yaw sample becomes an
"offscreen glance" versus nothing at all) is JavaScript and lives
outside this repo entirely, so there is nothing here to mirror it
against. `_runs()` below is this module's own minimal stand-in: a fixed
raw yaw threshold with no baseline (none exists yet at capture time) and
a duration split between a glance and a persistent look. It exists only
so a recorded clip produces *some* discrete events rather than one
Observation per frame.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Protocol

import numpy as np

from vtml.detectors.schema import DetectorType
from vtml.types import Channel, Observation, Source

# ponytail: fixed thresholds, not the candidate's own baseline -- no
# baseline exists at offline-capture time (baseline.py runs against a
# live session). Personalisation happens once these observations reach
# the engine (fusion/engine.py `_apply_personalisation`), same as a
# browser-captured session.
_GAZE_OFFSCREEN_YAW_DEG = 20.0
_PERSISTENT_MIN_MS = 5_000


class FaceReading(Protocol):
    face_count: int
    yaw_deg: float | None
    pitch_deg: float | None


class FaceReader(Protocol):
    def read(self, frame_rgb: np.ndarray) -> FaceReading: ...


def iter_frames(video_path: Path) -> Iterator[tuple[int, np.ndarray]]:
    """Yields `(t_ms, frame_rgb)` for every frame, using the container's
    own timestamps rather than assuming a constant frame rate -- a
    recorded clip can carry variable frame timing."""
    # Imported here, not at module level, so importing offline_video.py
    # itself (e.g. to reach FaceReader/observations_from_frames from a
    # test) never requires opencv to be installed unless this function
    # actually runs.
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise FileNotFoundError(f"could not open video: {video_path}")
    try:
        while True:
            ok, frame_bgr = capture.read()
            if not ok:
                break
            t_ms = int(capture.get(cv2.CAP_PROP_POS_MSEC))
            yield t_ms, cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    finally:
        capture.release()


def _runs(samples: list[tuple[int, bool]]) -> list[tuple[int, int]]:
    """Contiguous `(t_start_ms, t_end_ms)` spans where the per-frame
    flag is True. Shared between the scene and gaze passes below."""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    last_t = 0
    for t_ms, flag in samples:
        if flag and start is None:
            start = t_ms
        elif not flag and start is not None:
            runs.append((start, last_t))
            start = None
        last_t = t_ms
    if start is not None:
        runs.append((start, last_t))
    return runs


def observations_from_frames(
    frames: Iterator[tuple[int, np.ndarray]],
    reader: FaceReader,
    *,
    model_version: str = "1.0.0",
    seq_start: int = 0,
) -> list[Observation]:
    detector_name = f"offline.mediapipe@{model_version}"
    readings = [(t_ms, reader.read(frame)) for t_ms, frame in frames]

    scene_runs = _runs([(t_ms, r.face_count != 1) for t_ms, r in readings])
    gaze_runs = _runs(
        [
            (t_ms, r.yaw_deg is not None and abs(r.yaw_deg) > _GAZE_OFFSCREEN_YAW_DEG)
            for t_ms, r in readings
        ]
    )
    face_count_at = {t_ms: r.face_count for t_ms, r in readings}
    pose_at = {t_ms: (r.yaw_deg, r.pitch_deg) for t_ms, r in readings}

    observations: list[Observation] = []
    seq = seq_start

    for t_start, t_end in scene_runs:
        face_count = face_count_at[t_start]
        observations.append(
            Observation(
                seq=seq,
                t_ms=t_start,
                channel=Channel.SCENE,
                type=(
                    DetectorType.SCENE_FACE_ABSENT
                    if face_count == 0
                    else DetectorType.SCENE_MULTIPLE_FACES
                ),
                confidence=1.0,
                duration_ms=t_end - t_start,
                features={"face_count": float(face_count)},
                detector=detector_name,
                source=Source.OFFLINE,
            )
        )
        seq += 1

    for t_start, t_end in gaze_runs:
        duration_ms = t_end - t_start
        yaw, pitch = pose_at[t_start]
        observations.append(
            Observation(
                seq=seq,
                t_ms=t_start,
                channel=Channel.GAZE,
                type=(
                    DetectorType.GAZE_PERSISTENT_OFFSCREEN
                    if duration_ms >= _PERSISTENT_MIN_MS
                    else DetectorType.GAZE_OFFSCREEN_GLANCE
                ),
                confidence=1.0,
                duration_ms=duration_ms,
                features={"yaw_deg": yaw or 0.0, "pitch_deg": pitch or 0.0},
                detector=detector_name,
                source=Source.OFFLINE,
            )
        )
        seq += 1

    observations.sort(key=lambda o: o.t_ms)
    return [
        obs.model_copy(update={"seq": seq_start + i}) for i, obs in enumerate(observations)
    ]


def run(
    video_path: Path, reader: FaceReader, *, model_version: str = "1.0.0"
) -> list[Observation]:
    return observations_from_frames(iter_frames(video_path), reader, model_version=model_version)
