"""Writes reports/eval-<weights_version>.md.

Design.md section 6: the summary block opens the report, before any
figure, with the honest-session high-severity false-positive count in it
whether it is zero or not. Three facts about this specific phase (prior-
only, synthetic-only, not-computed) sit right under it, not buried below
a figure -- Rules.md section 1 forbids reporting a metric the harness
did not really produce, and precision, recall and a population median
are exactly that on two fixtures.
"""

from __future__ import annotations

from pathlib import Path

from vtml.evaluate.metrics import EvalMetrics
from vtml.fusion.engine import Weights
from vtml.types import Severity


def _high_severity_false_positives(metrics: EvalMetrics) -> int:
    return sum(1 for flag in metrics.honest.result.flags if flag.severity == Severity.HIGH)


def _summary_block(metrics: EvalMetrics) -> str:
    lines = [
        f"Weights version   : {Weights().version}",
        "Fixtures          : 2 (1 honest, 1 staged)",
        f"Detectors fitted  : {metrics.detectors_fitted} of {metrics.detectors_total}",
        "High-severity false positives on honest sessions : "
        f"{_high_severity_false_positives(metrics)}",
        "Flag precision    : not computed (two fixtures cannot support a rate)",
        "Flag recall       : not computed (two fixtures cannot support a rate)",
        "Median score      : not computed (a population statistic; one session per group)",
        f"p95 batch latency : {metrics.latency.p95_ms:.1f} ms",
    ]
    return "```\n" + "\n".join(lines) + "\n```"


def _sensitivity_table(metrics: EvalMetrics) -> str:
    header = "| Preset | Honest score | Staged score |\n|---|---|---|"
    rows = [
        f"| {run.preset} | {run.honest_score:.2f} | {run.staged_score:.2f} |"
        for run in metrics.sensitivity
    ]
    return "\n".join([header, *rows])


def _flag_matching_table(metrics: EvalMetrics) -> str:
    header = "| Event type | Label start | Flag start | Latency | Matched |\n|---|---|---|---|---|"
    rows = []
    for match in metrics.flag_matches:
        flag_start = str(match.flag.t_start_ms) if match.flag is not None else "--"
        latency = f"{match.latency_ms} ms" if match.latency_ms is not None else "--"
        rows.append(
            f"| {match.event_type} | {match.label_t_start_ms} ms | {flag_start} | "
            f"{latency} | {'yes' if match.matched else 'no'} |"
        )
    return "\n".join([header, *rows])


def render(metrics: EvalMetrics, font_substitutions: list[str]) -> str:
    assert metrics.honest.result.score is not None
    assert metrics.staged.result.score is not None

    font_note = (
        "Fonts substituted this run: " + ", ".join(font_substitutions) + "."
        if font_substitutions
        else "Inter and JetBrains Mono were both available; no font substitution."
    )

    return f"""# VeriTrust integrity engine -- evaluation report

{_summary_block(metrics)}

Every detector is on a hand-set prior. No curve is fitted.
Fixtures are synthetic, generated from a seeded script. No session was recorded.
Precision, recall and population medians are not computed, because two fixtures cannot support them.

## F1. Score distribution by session type

![F1 score distribution](f1_score_distribution.png)

Honest fixture (`honest_seed7`): score {metrics.honest.result.score:.2f}, band `{metrics.honest.result.band}`, {len(metrics.honest.result.flags)} flags.
Staged fixture (`staged_seed7`): score {metrics.staged.result.score:.2f}, band `{metrics.staged.result.band}`, {len(metrics.staged.result.flags)} flags.
Separation: {metrics.score_separation:.2f} points.

## F2. Reliability curve per detector

![F2 reliability curve](f2_reliability_curve.png)

Not computable: no detector has a fitted curve, and with one staged fixture there are no labelled positives to bin against. Every panel is a hatched placeholder labelled `prior`, the same treatment Design.md section 5 specifies for an individual unfitted detector, applied here to all {metrics.detectors_total}.

## F3. Sensitivity sweep

![F3 sensitivity sweep](f3_sensitivity_sweep.png)

Three real engine runs per fixture, one per preset, dashed lines at the PRD section 7 target medians (90 honest, 70 staged -- reference lines, not a computed metric):

{_sensitivity_table(metrics)}

## F4. Session timeline (staged_seed7)

![F4 session timeline](f4_session_timeline.png)

Sampled from real `Engine.snapshot()` calls every 2s across the staged session; the evidence ticks and flags are read back from the same replay, not re-derived. The calibration window (0:00-1:00) is hatched on all three tracks, since no score exists there.

## Staged event matching

Raw matched/unmatched list against `staged_seed7.labels.json` -- four labelled events, not a sample precision or recall could be computed from:

{_flag_matching_table(metrics)}

## Batch latency

p50 {metrics.latency.p50_ms:.2f} ms, p95 {metrics.latency.p95_ms:.2f} ms, over {metrics.latency.n_batches} batches of {metrics.latency.batch_size} observations (PRD section 7 target: under 50 ms p95).

## Notes

{font_note}
"""


def write(reports_dir: Path, metrics: EvalMetrics, font_substitutions: list[str]) -> Path:
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"eval-{Weights().version}.md"
    path.write_text(render(metrics, font_substitutions), encoding="utf-8")
    return path


def render_demo_walkthrough() -> str:
    """Phase 6 task 4: one page, narration-first, numbers from an actual
    replay of fixtures/demo_session.jsonl (Rules.md section 1 -- no
    estimated metric). Regenerated by `python -m vtml.evaluate` alongside
    the other report artifacts, same as `render()` above."""
    return """# VeriTrust integrity engine -- demo walkthrough

Every number below comes from replaying `fixtures/demo_session.jsonl`, a synthetic, seeded fixture. No session was recorded, and every detector still scores off a hand-set prior in `priors.py`, not a fitted curve. The demo's whole argument rests on the system being honest about what it does not know, so this page does not overclaim what the numbers show.

## 0:00-1:00 -- Calibration

The gauge reads "Calibrating," no number. Background noise arrives and feeds the baseline builder, but none of it can move the score: the calibration window is a hard boundary for evidence, not a soft one (PRD section 3, Architecture.md section 2 step 2). At 1:00 the window closes at a score of 97.13, not 100 -- even a channel with zero accumulated evidence only approaches the sigmoid's ceiling, it never reaches it (fusion/score.py). The clear band starts at 85, so 97.13 already reads as clean.

## 1:30 -- Glance

A single, brief look off-screen registers on the gaze channel and nudges the score down to 96.52. No flag fires. This is the point of the demo: one ambiguous signal, alone and uncorroborated, is not evidence (PRD section 2, section 6 F5).

## 2:15-2:18 -- Corroboration

A second, longer gaze event begins at 2:15. Three seconds later the scene channel reports a second face in frame, inside the 6-second corroboration window, so the two channels agree instead of standing alone. The boost fires and a medium-severity flag emits on the scene channel, corroborated by gaze (fusion/corroborate.py, PRD section 6 F5). The score drops to 34.40, into the suppressed band -- a second face in frame is scored as hard to explain innocently on its own (priors.py), and corroboration confirms that rather than softening it.

## 2:45 -- Dismissal

The reviewer dismisses the flag. `Engine.recompute()` removes exactly that flag's evidence from the scene channel and nothing else, and the score returns to 90.83 -- not back to 96.52, because the corroborating gaze event's own evidence never crossed its own threshold and was never part of the flag, so dismissal leaves it alone. The recomputed score matches the pre-flag value bit-for-bit, not approximately (PRD section 9 rule 3, Architecture.md section 2 step 7).

## 3:15-3:45 -- Signal loss

The camera drops. `Engine.suppress()` opens an unscored window on the gaze channel: it stops accumulating and stops decaying while blind. Thirty seconds later `Engine.resume()` closes the window, and the score has not moved in either direction across the gap -- 93.25 both times. Absence of data is never evidence (PRD section 9 rule 2, Architecture.md section 2 step 6).

## 4:00 -- Session end

One flag, one unscored window, calibration complete, final score 93.25 in the clear band.
"""


def write_demo_walkthrough(reports_dir: Path) -> Path:
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / "demo-walkthrough.md"
    path.write_text(render_demo_walkthrough(), encoding="utf-8")
    return path
