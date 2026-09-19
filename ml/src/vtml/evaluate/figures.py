"""Four evaluation figures, styled per Design.md sections 2, 4 and 5.

Every colour used below comes from `TOKENS`, itself copied from Design.md
section 1's token tables -- Rules.md section 4 treats a bare hex literal
in a call site as a bug, and this module is the only place besides
`vtml.mplstyle` allowed to name a colour at all.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import matplotlib

matplotlib.use("Agg")  # this module only ever writes files, never a window

import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter

from vtml.config import EngineConfig
from vtml.evaluate.metrics import FixtureRun, SensitivityRun
from vtml.evaluate.priors_sweep import MULTIPLIERS, SWEPT_CHANNELS, StabilityResult, SweepPoint
from vtml.fusion import corroborate
from vtml.fusion.engine import Engine, Weights
from vtml.types import Channel, Flag, Observation, Severity

_STYLE_PATH = Path(__file__).with_name("vtml.mplstyle")

TOKENS: dict[str, str] = {
    "sand/0": "#FFFFFF",
    "sand/100": "#F7F3EC",
    "sand/300": "#E3DACB",
    "sand/400": "#CFC3AE",
    "sand/500": "#8D8372",
    "sand/600": "#6E6558",
    "sand/800": "#2B2620",
    "clay/400": "#B08968",
    "clay/600": "#7B5A3D",
    "sage/400": "#7A8B6F",
    "amber/400": "#C99A4B",
    "terra/400": "#B5654D",
    "slate/400": "#6E8FA3",
}

_BAND_COLOR = {
    "clear": TOKENS["sage/400"],
    "review": TOKENS["amber/400"],
    "suppressed": TOKENS["terra/400"],
}
_BAND_RANGES: list[tuple[str, float, float]] = [
    ("suppressed", 0.0, 70.0),
    ("review", 70.0, 85.0),
    ("clear", 85.0, 100.0),
]

_SEVERITY_COLOR = {
    Severity.LOW: TOKENS["slate/400"],
    Severity.MEDIUM: TOKENS["amber/400"],
    Severity.HIGH: TOKENS["terra/400"],
}
# Severity is encoded by shape as well as colour (Design.md section 2
# rule 3): low is hollow, medium half-filled, high filled plus a ring
# drawn separately below.
_SEVERITY_FILLSTYLE = {Severity.LOW: "none", Severity.MEDIUM: "left", Severity.HIGH: "full"}

# Design.md section 3: fall back to DejaVu rather than let matplotlib
# substitute silently (a findfont warning per draw call, and no record
# of the substitution anywhere).
_FONT_SUBSTITUTIONS = {"Inter": "DejaVu Sans", "JetBrains Mono": "DejaVu Sans Mono"}


def configure_style() -> list[str]:
    """Loads vtml.mplstyle and returns which fonts were substituted, so
    the caller can record it (docs/Memory.md), per Design.md section 3."""
    plt.style.use(_STYLE_PATH)
    installed = {f.name for f in font_manager.fontManager.ttflist}
    applied = []
    if "Inter" not in installed:
        plt.rcParams["font.sans-serif"] = [_FONT_SUBSTITUTIONS["Inter"]]
        applied.append(f"Inter -> {_FONT_SUBSTITUTIONS['Inter']}")
    if "JetBrains Mono" not in installed:
        plt.rcParams["font.monospace"] = [_FONT_SUBSTITUTIONS["JetBrains Mono"]]
        applied.append(f"JetBrains Mono -> {_FONT_SUBSTITUTIONS['JetBrains Mono']}")
    return applied


def _mmss(t_ms: float, _pos: object = None) -> str:
    total_s = int(t_ms // 1000)
    return f"{total_s // 60:02d}:{total_s % 60:02d}"


def _draw_calibration_hatch(ax: Axes, calibration_end_ms: float) -> None:
    """Design.md section 2 rule 2: unscored is `sand/400` plus 45-degree
    `///` hatching, never a flat fill -- it must be unmistakable next to a
    flag in greyscale. Matplotlib's hatch colour follows the patch's
    `edgecolor` (rcParam `hatch.color: edge`), so an explicit edgecolor
    and a non-zero linewidth are required or the hatch silently does not
    render at all, leaving a plain block."""
    ax.axvspan(
        0, calibration_end_ms, facecolor=TOKENS["sand/400"],
        edgecolor=TOKENS["sand/500"], hatch="///", linewidth=0.8,
    )


def figure_score_distribution(honest: FixtureRun, staged: FixtureRun) -> Figure:
    """F1: two points, not two distributions -- Design.md section 5 is
    explicit that a violin or KDE over one observation each would be
    faking depth the two fixtures don't have."""
    assert honest.result.score is not None
    assert staged.result.score is not None

    fig, ax = plt.subplots(figsize=(7.0, 4.0))
    for _band, lo, hi in _BAND_RANGES:
        ax.axvspan(lo, hi, color=_BAND_COLOR[_band], alpha=0.12, lw=0)

    ax.plot(
        honest.result.score, 1, marker="o", markersize=14,
        markerfacecolor=TOKENS["sage/400"], markeredgecolor=TOKENS["sage/400"],
        linestyle="none", label="honest",
    )
    ax.plot(
        staged.result.score, 0, marker="o", markersize=14, fillstyle="none",
        markerfacecolor=TOKENS["terra/400"], markeredgecolor=TOKENS["terra/400"],
        markeredgewidth=1.8, linestyle="none", label="staged",
    )
    ax.set_yticks([0, 1])
    ax.set_yticklabels(["staged", "honest"])
    ax.set_ylim(-0.6, 1.6)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Integrity score")
    ax.legend(loc="upper left")
    return fig


def _hatch_panel_background(ax: Axes) -> None:
    """Design.md section 2 rule 2's "not computable" panel treatment,
    shared by F2 (unfitted detector) and F5 (unexercised channel)."""
    ax.set_facecolor(TOKENS["sand/400"])
    ax.patch.set_hatch("///")
    ax.patch.set_edgecolor(TOKENS["sand/500"])


def figure_reliability_grid(detector_types: list[str], *, ncols: int = 4) -> Figure:
    """F2: not computable this phase -- no detector has a fitted curve
    and there are no labelled positives to bin. Every panel is hatched
    and labelled `prior`, exactly Design.md section 5's own prescription
    for an unfitted detector, applied to all sixteen rather than skipping
    the figure (see docs/Memory.md for the reasoning)."""
    # detector_types are DetectorType members (str-Enum): plain str()
    # renders "DetectorType.X", not the dotted type string, since Enum's
    # own __str__ takes priority over the str mixin -- .value is correct.
    labels = [getattr(t, "value", t) for t in detector_types]
    n = len(labels)
    nrows = -(-n // ncols)
    fig, axes = plt.subplots(nrows, ncols, figsize=(9.0, 2.0 * nrows), squeeze=False)
    for i, ax in enumerate(axes.flat):
        if i >= n:
            ax.axis("off")
            continue
        _hatch_panel_background(ax)
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_xlabel(labels[i], fontsize=7, rotation=20, ha="right")
        ax.text(
            0.5, 0.5, "prior", transform=ax.transAxes, ha="center", va="center",
            color=TOKENS["sand/600"], fontsize=9,
        )
    fig.tight_layout()
    return fig


def figure_sensitivity_sweep(sensitivity: list[SensitivityRun]) -> Figure:
    """F3: three real runs per fixture, one per preset -- an ordered
    ramp (lenient lightest to strict darkest), not three unrelated hues."""
    import numpy as np

    colors = {"lenient": TOKENS["sand/400"], "standard": TOKENS["clay/400"], "strict": TOKENS["clay/600"]}
    groups = ["honest", "staged"]
    targets = {"honest": 90.0, "staged": 70.0}
    x = np.arange(len(groups))
    width = 0.25

    fig, ax = plt.subplots(figsize=(7.0, 4.0))
    for i, run in enumerate(sensitivity):
        offset = (i - 1) * width
        values = [run.honest_score, run.staged_score]
        ax.bar(x + offset, values, width, color=colors[run.preset], label=run.preset)

    span = (len(sensitivity) * width) / 2 + 0.05
    for i, group in enumerate(groups):
        ax.hlines(
            targets[group], x[i] - span, x[i] + span,
            colors=TOKENS["sand/600"], linestyles="dashed", linewidth=1.2,
        )

    ax.set_xticks(list(x))
    ax.set_xticklabels(groups)
    ax.set_ylabel("Integrity score")
    ax.set_ylim(0, 100)
    ax.legend()
    return fig


def figure_prior_sensitivity_sweep(
    points: list[SweepPoint], stability: list[StabilityResult]
) -> Figure:
    """F5: small multiples, one panel per scored channel, x axis the
    prior multiplier on a log scale, y axis the final score, band
    boundaries shaded behind both series so the reader sees the verdict
    (Design.md section 2 rule 2's "unmistakable" standard, applied here
    to a sweep instead of a timeline). Honest is a filled `sage/400`
    line, staged a hollow-marker `terra/400` line, distinguished by
    marker fill as F1 already does, not colour alone (Design.md section
    2 rule 4).

    A channel neither fixture ever exercises (`StabilityResult.exercised`
    is False -- audio, disabled in v1, PRD.md section 5) gets the same
    hatched `sand/400` "not computable" treatment F2 already uses for an
    unfitted detector: a flat line here is a no-op, not a stability
    result, and drawing it identically to a real pass would be the
    figure making a claim the sweep does not support.
    """
    # run_sweep() emits points ordered by (channel, multiplier), so
    # by_channel[channel] is already ascending in multiplier -- no re-sort.
    by_channel = {c: [p for p in points if p.channel == c] for c in SWEPT_CHANNELS}
    stability_by_channel = {r.channel: r for r in stability}

    ncols = len(SWEPT_CHANNELS)
    fig, axes = plt.subplots(1, ncols, figsize=(11.5, 3.2), squeeze=False, sharey=True)

    for i, channel in enumerate(SWEPT_CHANNELS):
        ax = axes[0][i]
        rows = by_channel[channel]
        result = stability_by_channel[channel]

        for _band, lo, hi in _BAND_RANGES:
            ax.axhspan(lo, hi, color=_BAND_COLOR[_band], alpha=0.12, lw=0)

        if not result.exercised:
            _hatch_panel_background(ax)
            ax.text(
                0.5, 0.5, "no observations\nin either fixture",
                transform=ax.transAxes, ha="center", va="center",
                color=TOKENS["sand/600"], fontsize=8,
            )
        else:
            ax.plot(
                [p.multiplier for p in rows], [p.honest_score for p in rows],
                color=TOKENS["sage/400"], marker="o", markersize=5,
                markerfacecolor=TOKENS["sage/400"], markeredgecolor=TOKENS["sage/400"],
                label="honest",
            )
            ax.plot(
                [p.multiplier for p in rows], [p.staged_score for p in rows],
                color=TOKENS["terra/400"], marker="o", markersize=5, fillstyle="none",
                markeredgewidth=1.4, label="staged",
            )

        ax.set_xscale("log", base=2)
        ax.set_xticks([MULTIPLIERS[0], 1.0, MULTIPLIERS[-1]])
        ax.set_xticklabels(["0.25x", "1x", "4x"])
        ax.set_ylim(0, 100)
        ax.set_xlabel(channel.value, fontsize=9)
        if i == 0:
            ax.set_ylabel("Integrity score")
            ax.legend(loc="lower left", fontsize=8)

    fig.tight_layout()
    return fig


def save_f5(
    reports_dir: Path, points: list[SweepPoint], stability: list[StabilityResult]
) -> Path:
    """Written by `python -m vtml.evaluate.priors_sweep`, not by the
    standard `python -m vtml.evaluate` run -- the sweep is 45 engine
    replays and is not part of the every-run report."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    fig = figure_prior_sensitivity_sweep(points, stability)
    png_path = reports_dir / "f5_prior_sensitivity_sweep.png"
    fig.savefig(png_path)
    fig.savefig(reports_dir / "f5_prior_sensitivity_sweep.svg")
    plt.close(fig)
    return png_path


@dataclass(frozen=True)
class _EvidenceTick:
    t_ms: int
    channel: Channel
    llr: float
    corroborated: bool


@dataclass(frozen=True)
class _ScoreSample:
    t_ms: int
    score: float | None


@dataclass(frozen=True)
class DriverAction:
    """A reviewer/system action interleaved into `_build_timeline`'s replay
    alongside real observations and snapshot samples. The demo fixture's
    dismissal and signal loss are driver actions, not observations
    (Architecture.md section 2 steps 6-7), so nothing in `observations`
    can carry them -- `figure_session_timeline` takes them as a separate,
    optional schedule instead of forking a second timeline builder.
    `dismiss_latest` marks the most recently emitted (still-undismissed)
    flag for Track 3's styling; it never touches score sampling, so
    Track 1 keeps showing the score as it actually happened, not a
    dismissal-rewritten history."""

    t_ms: int
    kind: Literal["suppress", "resume", "dismiss_latest"]
    channel: Channel | None = None
    reason: str | None = None


def _build_timeline(
    observations: list[Observation],
    config: EngineConfig,
    sample_interval_ms: int,
    driver_actions: Sequence[DriverAction] = (),
    session_end_ms: int | None = None,
) -> tuple[list[_ScoreSample], list[_EvidenceTick], list[Flag], frozenset[str]]:
    """Drives one throwaway Engine through the session, interleaving real
    ingest() calls (to capture each observation's actual accumulated LLR
    and corroboration state) with snapshot() calls at a fixed interval
    (Track 1's score arc) and, for the demo fixture only, driver actions
    at their scripted times. Reads `Engine._channels`/`Engine._flags`
    directly, same as `tests/test_snapshot.py` already does, so the
    figure draws the exact numbers the engine scored with rather than a
    re-derived approximation.

    `session_end_ms` defaults to the last observation's time (the staged
    eval fixture has no driver actions past its last observation), but
    the demo's driver actions (dismissal, then a 30s signal loss) run
    well past its last observation -- `save_demo_timeline` passes the
    fixture's real closing time explicitly so the chart isn't clipped
    mid-story.
    """
    engine = Engine(config, Weights())
    ordered = sorted(observations, key=lambda o: o.t_ms)
    actions = sorted(driver_actions, key=lambda a: a.t_ms)
    session_end = session_end_ms if session_end_ms is not None else ordered[-1].t_ms
    sample_points = list(range(0, session_end + 1, sample_interval_ms))

    ticks: list[_EvidenceTick] = []
    samples: list[_ScoreSample] = []
    dismissed_ids: set[str] = set()
    obs_idx = 0
    sample_idx = 0
    action_idx = 0
    while obs_idx < len(ordered) or sample_idx < len(sample_points) or action_idx < len(actions):
        next_obs = ordered[obs_idx].t_ms if obs_idx < len(ordered) else None
        next_sample = sample_points[sample_idx] if sample_idx < len(sample_points) else None
        next_action = actions[action_idx].t_ms if action_idx < len(actions) else None
        t_next = min(t for t in (next_obs, next_sample, next_action) if t is not None)

        if next_action == t_next:
            action = actions[action_idx]
            if action.kind == "suppress":
                assert action.channel is not None
                engine._t_now = action.t_ms  # see replay.py: suppress()/resume() key off it
                engine.suppress(action.channel, action.reason or "")
            elif action.kind == "resume":
                assert action.channel is not None
                engine._t_now = action.t_ms
                engine.resume(action.channel)
            else:
                if engine._flags:
                    dismissed_ids.add(engine._flags[-1].id)
            action_idx += 1
        elif next_obs == t_next:
            obs = ordered[obs_idx]
            _boost, corroborated_by = corroborate.compute_boost(
                engine._channels, obs.channel, obs.t_ms, config
            )
            state = engine._channels[obs.channel]
            recent_before = len(state.recent)
            engine.ingest([obs])
            # A calibration-window observation is accepted but never
            # reaches state.add() (fusion/engine.py::_process_one) -- no
            # evidence, no tick, matching the hatched "nothing scored here"
            # region drawn behind it. Comparing recent's length, rather
            # than trusting IngestResult.accepted, is what actually
            # detects that distinction.
            if len(state.recent) > recent_before:
                evidence = state.recent[-1]
                ticks.append(
                    _EvidenceTick(
                        t_ms=obs.t_ms,
                        channel=obs.channel,
                        llr=evidence.llr,
                        corroborated=bool(corroborated_by),
                    )
                )
            obs_idx += 1
        else:
            assert next_sample == t_next
            snapshot_result = engine.snapshot(next_sample)
            samples.append(_ScoreSample(t_ms=next_sample, score=snapshot_result.score))
            sample_idx += 1

    final = engine.finalise(session_end)
    return samples, ticks, list(final.flags), frozenset(dismissed_ids)


def figure_session_timeline(
    observations: list[Observation],
    config: EngineConfig,
    *,
    sample_interval_ms: int = 2000,
    driver_actions: Sequence[DriverAction] = (),
    session_end_ms: int | None = None,
) -> Figure:
    """F4, the centrepiece: three stacked tracks on a shared mm:ss axis,
    sampled from real `Engine.snapshot()`/`ingest()` calls, never
    fabricated. Twice the size of the other three (Design.md section 5).
    `driver_actions` (empty for the eval harness's staged fixture, set for
    the demo fixture) marks any dismissed flag for Track 3's styling.
    `session_end_ms` overrides the x-axis's end for a fixture whose driver
    actions run past its last observation (see `_build_timeline`)."""
    samples, ticks, flags, dismissed_ids = _build_timeline(
        observations, config, sample_interval_ms, driver_actions, session_end_ms
    )
    calibration_end_ms = config.calibration_window_s * 1000
    session_end = session_end_ms if session_end_ms is not None else max(o.t_ms for o in observations)

    fig, (ax_score, ax_evidence, ax_flags) = plt.subplots(
        3, 1, figsize=(12.0, 5.0), sharex=True, gridspec_kw={"height_ratios": [2.0, 2.4, 1.0]}
    )

    # -- Track 1: score -------------------------------------------------
    for _band, lo, hi in _BAND_RANGES:
        ax_score.axhspan(lo, hi, color=_BAND_COLOR[_band], alpha=0.12, lw=0)
    _draw_calibration_hatch(ax_score, calibration_end_ms)
    scored = [s for s in samples if s.score is not None]
    ax_score.plot([s.t_ms for s in scored], [s.score for s in scored], color=TOKENS["clay/600"])
    ax_score.set_ylim(0, 100)
    ax_score.set_ylabel("Score")

    # -- Track 2: evidence -----------------------------------------------
    channels_order = list(Channel)
    row_of = {c: i for i, c in enumerate(channels_order)}
    _draw_calibration_hatch(ax_evidence, calibration_end_ms)
    max_llr = max((abs(t.llr) for t in ticks), default=1.0) or 1.0
    # A floor height so background noise (LLR ~0.15-0.35) still reads as a
    # visible mark instead of a sub-pixel hairline -- the corroboration
    # argument this track exists to make needs constant, mostly-nothing
    # evidence to actually be seen. Proportional scaling continues above
    # the floor, linearly (no log scale): a flagged spike still reads as
    # clearly larger than background noise, not just "present".
    min_height, max_height = 0.12, 0.42
    for t in ticks:
        row = row_of[t.channel]
        height = min_height + (max_height - min_height) * min(abs(t.llr) / max_llr, 1.0)
        color = TOKENS["clay/600"] if t.corroborated else TOKENS["clay/400"]
        ax_evidence.vlines(t.t_ms, row - height, row + height, color=color, linewidth=1.2)
    ax_evidence.set_yticks(list(row_of.values()))
    ax_evidence.set_yticklabels([c.value for c in channels_order])
    ax_evidence.set_ylim(-0.6, len(channels_order) - 0.4)
    ax_evidence.set_ylabel("Evidence")

    # -- Track 3: flags ---------------------------------------------------
    _draw_calibration_hatch(ax_flags, calibration_end_ms)
    for i, flag in enumerate(flags):
        color = _SEVERITY_COLOR[flag.severity]
        # Design.md section 5: a dismissed flag is never removed -- the
        # dismissal is part of the story -- but drawn at 40% opacity with
        # a strikethrough on its label.
        dismissed = flag.id in dismissed_ids
        alpha = 0.4 if dismissed else 1.0
        ax_flags.plot(
            flag.t_start_ms, 0, marker="o", markersize=12,
            fillstyle=_SEVERITY_FILLSTYLE[flag.severity],
            markerfacecolor=color, markeredgecolor=color, markeredgewidth=1.6, linestyle="none",
            alpha=alpha,
        )
        if flag.severity == Severity.HIGH:
            ax_flags.plot(
                flag.t_start_ms, 0, marker="o", markersize=19, fillstyle="none",
                markeredgecolor=color, markeredgewidth=1.6, linestyle="none", alpha=alpha,
            )
        # Staggered so two flags close together in time (e.g. corroborating
        # channels a few seconds apart) don't print their deltas on top of
        # each other.
        y_offset = 13 if i % 2 == 0 else 26
        label = f"{flag.score_delta:+.1f}"
        if dismissed:
            # Combining-character strikethrough: no extra plotting logic,
            # renders correctly through matplotlib's normal text path.
            label = "̶".join(label) + "̶"
        ax_flags.annotate(
            label, (flag.t_start_ms, 0), textcoords="offset points",
            xytext=(0, y_offset), ha="center", fontsize=9, family="monospace",
            color=TOKENS["sand/800"], alpha=alpha,
        )
    ax_flags.set_yticks([])
    ax_flags.set_ylim(-1, 1)
    ax_flags.set_xlim(0, session_end)
    ax_flags.set_xlabel("Session time")
    ax_flags.xaxis.set_major_formatter(FuncFormatter(_mmss))

    fig.tight_layout()
    return fig


def save_demo_timeline(
    reports_dir: Path,
    observations: list[Observation],
    config: EngineConfig,
    driver_actions: Sequence[DriverAction],
    session_end_ms: int,
) -> Path:
    """Phase 6 task 3: the same F4 code path as `save_all`, over the demo
    fixture, with the reviewer's dismissal and the signal-loss suppress/
    resume as driver actions -- never forked into a second figure
    function. Writes `reports/demo_timeline.png` and `.svg`."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    fig = figure_session_timeline(
        observations, config, driver_actions=driver_actions, session_end_ms=session_end_ms
    )
    png_path = reports_dir / "demo_timeline.png"
    fig.savefig(png_path)
    fig.savefig(reports_dir / "demo_timeline.svg")
    plt.close(fig)
    return png_path


def save_all(
    reports_dir: Path,
    honest: FixtureRun,
    staged: FixtureRun,
    sensitivity: list[SensitivityRun],
    detector_types: list[str],
    config: EngineConfig,
) -> dict[str, Path]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    figures = {
        "f1_score_distribution": figure_score_distribution(honest, staged),
        "f2_reliability_curve": figure_reliability_grid(detector_types),
        "f3_sensitivity_sweep": figure_sensitivity_sweep(sensitivity),
        "f4_session_timeline": figure_session_timeline(staged.observations, config),
    }
    paths: dict[str, Path] = {}
    for name, fig in figures.items():
        png_path = reports_dir / f"{name}.png"
        svg_path = reports_dir / f"{name}.svg"
        fig.savefig(png_path)
        fig.savefig(svg_path)
        plt.close(fig)
        paths[name] = png_path
    return paths
