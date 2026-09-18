"""python -m vtml.replay: streams fixtures/demo_session.jsonl through the
engine and prints a readable trace of its five beats -- real time by
default, faster for recording, instant for tests.

The dismissal and the signal loss are driver actions, not observations
(Architecture.md section 2 steps 6-7): a reviewer clicking dismiss or a
camera dropping out never arrives as an Observation on the wire. This
module holds the beat schedule (imported from the generator that scripted
the same fixture, so there is exactly one copy of it) and calls
Engine.recompute()/suppress()/resume() itself at the right session times,
interleaved with the real ingest()/snapshot() calls the fixture's
observations drive.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections.abc import Callable
from pathlib import Path

from vtml.config import STANDARD
from vtml.fixtures.synthetic.generate import (
    DEMO_CALIBRATION_CHECK_T_MS,
    DEMO_CORROBORATION_SCENE_T_MS,
    DEMO_DISMISSAL_T_MS,
    DEMO_GLANCE_T_MS,
    DEMO_RESUME_T_MS,
    DEMO_SESSION_END_MS,
    DEMO_SUPPRESS_CHANNEL,
    DEMO_SUPPRESS_REASON,
    DEMO_SUPPRESS_T_MS,
)
from vtml.fusion.engine import Engine, Weights
from vtml.types import Observation, SessionResult

_FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "demo_session.jsonl"


def _load(path: Path) -> list[Observation]:
    with path.open(encoding="utf-8") as f:
        return [Observation.model_validate_json(line) for line in f if line.strip()]


def _mmss(t_ms: int) -> str:
    total_s = t_ms // 1000
    return f"{total_s // 60:02d}:{total_s % 60:02d}"


def run(speed: float, out: Callable[[str], None], fixture_path: Path = _FIXTURE) -> None:
    """Drives one Engine through the demo fixture, calling `out(line)` for
    each beat as it happens. `speed <= 0` dumps every beat immediately
    (tests, `--speed 0`); `speed > 0` sleeps between beats scaled to real
    session time, `speed=1` being real time."""
    pending = sorted(_load(fixture_path), key=lambda o: o.t_ms)
    engine = Engine(STANDARD, Weights())
    clock = 0
    seen_flags: set[str] = set()

    def wait_until(t_ms: int) -> None:
        nonlocal clock
        if speed > 0:
            time.sleep(max(0.0, t_ms - clock) / 1000 / speed)
        clock = t_ms

    def ingest_through(t_ms: int) -> None:
        nonlocal pending
        due = [o for o in pending if o.t_ms <= t_ms]
        pending = [o for o in pending if o.t_ms > t_ms]
        if due:
            engine.ingest(due)

    def emit(t_ms: int, beat: str, result: SessionResult, note: str) -> None:
        score = "   -- " if result.score is None else f"{result.score:6.2f}"
        out(f"[{_mmss(t_ms)}] {beat:<18} score={score} band={result.band:<11} {note}")
        for flag in result.flags:
            if flag.id in seen_flags:
                continue
            seen_flags.add(flag.id)
            out(
                f"           flag {flag.id} [{flag.severity.value}] {flag.type}: "
                f'"{flag.narrative}" (score_delta={flag.score_delta:+.2f})'
            )

    wait_until(DEMO_CALIBRATION_CHECK_T_MS)
    ingest_through(DEMO_CALIBRATION_CHECK_T_MS)
    emit(
        DEMO_CALIBRATION_CHECK_T_MS,
        "calibration",
        engine.snapshot(DEMO_CALIBRATION_CHECK_T_MS),
        "observe-only window: background noise feeds the baseline, nothing scored",
    )

    calibration_end_ms = int(STANDARD.calibration_window_s * 1000)
    wait_until(calibration_end_ms)
    ingest_through(calibration_end_ms)
    emit(
        calibration_end_ms,
        "calibration ends",
        engine.snapshot(calibration_end_ms),
        "clean session, no scripted event yet -- this is as high as the score reads",
    )

    wait_until(DEMO_GLANCE_T_MS)
    ingest_through(DEMO_GLANCE_T_MS)
    emit(
        DEMO_GLANCE_T_MS,
        "glance",
        engine.snapshot(DEMO_GLANCE_T_MS),
        "one gaze glance, alone -- accumulates, no flag: not evidence by itself",
    )

    wait_until(DEMO_CORROBORATION_SCENE_T_MS)
    ingest_through(DEMO_CORROBORATION_SCENE_T_MS)
    corroboration_result = engine.snapshot(DEMO_CORROBORATION_SCENE_T_MS)
    emit(
        DEMO_CORROBORATION_SCENE_T_MS,
        "corroboration",
        corroboration_result,
        "gaze and scene agree inside the 6s window -- boost fires, flag emits",
    )

    wait_until(DEMO_DISMISSAL_T_MS)
    flag_id = corroboration_result.flags[-1].id
    dismissed_result = engine.recompute(dismissed_ids=[flag_id])
    emit(
        DEMO_DISMISSAL_T_MS,
        "dismissal",
        dismissed_result,
        f"reviewer dismissed {flag_id}; score restored exactly, not approximately",
    )

    wait_until(DEMO_SUPPRESS_T_MS)
    # suppress()/resume() key off Engine._t_now, which only advances via
    # ingest() -- nothing is ingested at this instant, so the driver sets
    # it directly. Same "reach into engine internals" precedent as
    # evaluate/figures.py's engine._channels reads (docs/Memory.md).
    engine._t_now = DEMO_SUPPRESS_T_MS
    engine.suppress(DEMO_SUPPRESS_CHANNEL, DEMO_SUPPRESS_REASON)
    emit(
        DEMO_SUPPRESS_T_MS,
        "signal loss",
        engine.recompute(dismissed_ids=[flag_id]),
        f"{DEMO_SUPPRESS_CHANNEL.value} suppressed ({DEMO_SUPPRESS_REASON}); unscored window opens",
    )

    wait_until(DEMO_RESUME_T_MS)
    engine._t_now = DEMO_RESUME_T_MS
    engine.resume(DEMO_SUPPRESS_CHANNEL)
    emit(
        DEMO_RESUME_T_MS,
        "signal loss ends",
        engine.recompute(dismissed_ids=[flag_id]),
        f"{DEMO_SUPPRESS_CHANNEL.value} resumed; score did not move while it was blind",
    )

    wait_until(DEMO_SESSION_END_MS)
    final = engine.recompute(dismissed_ids=[flag_id])
    emit(
        DEMO_SESSION_END_MS,
        "session end",
        final,
        f"{len(final.flags)} flag(s) recorded, {len(final.unscored)} unscored window(s), "
        f"calibration={final.calibration}",
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Replay fixtures/demo_session.jsonl and print its trace.")
    parser.add_argument(
        "--speed", type=float, default=1.0,
        help="playback speed: 1.0 is real time, 10 for recording, 0 to dump instantly",
    )
    args = parser.parse_args(argv)

    # Rules.md section 4: no print() in src/. A bare "%(message)s" handler
    # on stdout gives the same plain-text trace print() would, still going
    # through logging -- it is being screen-recorded, so no level prefix.
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    run(args.speed, logger.info)


if __name__ == "__main__":
    main()
