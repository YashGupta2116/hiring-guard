"""BaselineBuilder: the first `config.calibration_window_s` of a session,
personalised thresholds derived from it, and the KS test rhythm anomaly
detection reads. PRD.md F3, Architecture.md section 2 steps 2-3.

`BaselineBuilder.observe()` is opportunistic: it reads whatever of
`yaw_deg`/`pitch_deg`/`interval_ms` an observation's `features` carry,
regardless of its detector type. None of the 16 registry types is itself
a raw telemetry sample -- PRD.md section 5 lists detection *events*
(a glance, a burst), not a periodic pose or keystroke feed -- so there is
no single canonical "baseline sample" type to key off. Reading whatever
feature keys are present is the simplest thing that works with the
schema as specified. Not from the spec; my own call, recorded in
docs/Memory.md.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median
from typing import Any

from vtml.config import EngineConfig
from vtml.detectors.schema import DetectorType
from vtml.types import Channel, Observation

# Population defaults, used only when a signal has too few samples to
# trust the candidate's own data: dead ahead, and a keystroke interval
# spread typical of average typing speed (roughly 180-260ms per key).
_POPULATION_GAZE_HOME: tuple[tuple[float, float], ...] = ((0.0, 0.0),)
_POPULATION_HEAD_POSE: tuple[float, float] = (0.0, 0.0)
_POPULATION_KEYSTROKE_INTERVALS_MS: tuple[float, ...] = (180.0, 200.0, 220.0, 240.0, 260.0)
_POPULATION_GLANCE_RATE_PER_MIN: float = 3.0


@dataclass(frozen=True)
class Baseline:
    gaze_home_hull: tuple[tuple[float, float], ...]
    head_pose_neutral: tuple[float, float]
    keystroke_intervals_ms: tuple[float, ...]
    glance_rate_per_min: float
    fallback: bool


def _convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Andrew's monotone chain. No scipy at runtime (Rules.md section 3);
    a 2D hull over at most a few hundred points is well inside "ten lines
    of NumPy" territory even written in plain Python."""

    def cross(o: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    lower: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


class BaselineBuilder:
    def __init__(self, config: EngineConfig) -> None:
        self._config = config
        self._gaze_points: list[tuple[float, float]] = []
        self._keystroke_intervals: list[float] = []
        self._glance_count: int = 0

    def to_state(self) -> dict[str, Any]:
        """The samples gathered so far, for `Engine.to_state()`.

        The config is deliberately absent: it is passed to `from_state()` by
        the caller, the same way `Engine.from_state()` takes its own, so a
        serialised session can never carry a stale copy of the constants.
        """
        return {
            "gaze_points": [list(p) for p in self._gaze_points],
            "keystroke_intervals": list(self._keystroke_intervals),
            "glance_count": self._glance_count,
        }

    @classmethod
    def from_state(cls, state: dict[str, Any], config: EngineConfig) -> "BaselineBuilder":
        builder = cls(config)
        builder._gaze_points = [(float(p[0]), float(p[1])) for p in state["gaze_points"]]
        builder._keystroke_intervals = [float(v) for v in state["keystroke_intervals"]]
        builder._glance_count = int(state["glance_count"])
        return builder

    def observe(self, obs: Observation) -> None:
        if obs.channel == Channel.GAZE:
            yaw = obs.features.get("yaw_deg")
            pitch = obs.features.get("pitch_deg")
            if yaw is not None and pitch is not None:
                self._gaze_points.append((yaw, pitch))
            if obs.type == DetectorType.GAZE_OFFSCREEN_GLANCE.value:
                self._glance_count += 1
        elif obs.channel == Channel.INPUT:
            interval = obs.features.get("interval_ms")
            if interval is not None:
                self._keystroke_intervals.append(interval)

    def finalise(self, now_ms: int) -> Baseline:
        # "Not enough": t_ms is session-relative from open (Architecture.md
        # section 4), so the calibration window is simply [0, window). A
        # session that closes before the window elapses has not observed
        # a normal `calibration_window_s` of behaviour, no matter how
        # much happened in the time it had -- this is a session-duration
        # check, not a sample-count one.
        fallback = now_ms < self._config.calibration_window_s * 1000

        if len(self._gaze_points) >= self._config.baseline_min_gaze_samples:
            hull = tuple(_convex_hull(self._gaze_points))
            neutral = (
                median(p[0] for p in self._gaze_points),
                median(p[1] for p in self._gaze_points),
            )
        else:
            hull = _POPULATION_GAZE_HOME
            neutral = _POPULATION_HEAD_POSE

        if len(self._keystroke_intervals) >= self._config.baseline_min_keystroke_samples:
            intervals = tuple(self._keystroke_intervals)
        else:
            intervals = _POPULATION_KEYSTROKE_INTERVALS_MS

        minutes = now_ms / 1000 / 60
        glance_rate = self._glance_count / minutes if minutes > 0 else _POPULATION_GLANCE_RATE_PER_MIN

        return Baseline(
            gaze_home_hull=hull,
            head_pose_neutral=neutral,
            keystroke_intervals_ms=intervals,
            glance_rate_per_min=glance_rate,
            fallback=fallback,
        )


def is_within_personal_gaze_tolerance(
    yaw_deg: float, baseline: Baseline, config: EngineConfig
) -> bool:
    """True when a gaze sample sits within the candidate's own resting
    yaw -- someone who sits at an angle to their camera is not
    permanently looking away (task 4)."""
    return abs(yaw_deg - baseline.head_pose_neutral[0]) < config.gaze_personalised_yaw_threshold_deg


def _ks_statistic(sample1: Sequence[float], sample2: Sequence[float]) -> float:
    a = sorted(sample1)
    b = sorted(sample2)
    n1, n2 = len(a), len(b)
    all_values = sorted(set(a) | set(b))

    def ecdf(sorted_sample: list[float], value: float) -> float:
        # count(<=value) / n via a manual scan; the sample sizes here are
        # a 30 s window's worth of keystrokes, not a scan-heavy dataset.
        count = 0
        for x in sorted_sample:
            if x <= value:
                count += 1
            else:
                break
        return count / len(sorted_sample)

    return max(abs(ecdf(a, v) - ecdf(b, v)) for v in all_values)


def _kolmogorov_p_value(d: float, n1: int, n2: int) -> float:
    """Asymptotic two-sided KS p-value (Kolmogorov distribution). The
    same closed-form approximation `scipy.stats.ks_2samp`'s asymptotic
    mode uses -- Rules.md section 3 bans scipy at runtime, but the
    formula itself is public-domain maths, not a scipy internal."""
    n_eff = n1 * n2 / (n1 + n2)
    en = math.sqrt(n_eff)
    lam = max((en + 0.12 + 0.11 / en) * d, 0.0)
    if lam == 0.0:
        return 1.0
    total = 0.0
    for k in range(1, 101):
        term = ((-1) ** (k - 1)) * math.exp(-2.0 * lam * lam * k * k)
        total += term
        if abs(term) < 1e-10:
            break
    return max(0.0, min(1.0, 2.0 * total))


def ks_2samp(sample1: Sequence[float], sample2: Sequence[float]) -> tuple[float, float]:
    """Two-sample Kolmogorov-Smirnov test: returns (D, p)."""
    d = _ks_statistic(sample1, sample2)
    p = _kolmogorov_p_value(d, len(sample1), len(sample2))
    return d, p


def rhythm_is_anomalous(
    recent_intervals_ms: Sequence[float],
    chars_per_sec: float,
    baseline: Baseline,
    config: EngineConfig,
) -> bool:
    """Task 4: flag only when the KS statistic, its p-value, and a
    sustained burst rate all cross their bars together."""
    if len(recent_intervals_ms) < 2 or len(baseline.keystroke_intervals_ms) < 2:
        return False
    d, p = ks_2samp(recent_intervals_ms, baseline.keystroke_intervals_ms)
    return (
        d > config.rhythm_ks_d_threshold
        and p < config.rhythm_ks_p_threshold
        and chars_per_sec >= config.rhythm_burst_rate_threshold
    )
