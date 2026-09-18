"""`python -m vtml.evaluate`: no arguments, no `--weights` flag -- there is
no weights.json this phase (Phase 3 is cut), so every run scores off
`priors.py` and reports exactly that.
"""

from __future__ import annotations

import logging
from pathlib import Path

from vtml.config import STANDARD
from vtml.detectors.schema import REGISTRY as DETECTOR_REGISTRY
from vtml.evaluate import figures, metrics, report
from vtml.evaluate.figures import DriverAction
from vtml.fixtures.synthetic.generate import (
    DEMO_DISMISSAL_T_MS,
    DEMO_RESUME_T_MS,
    DEMO_SESSION_END_MS,
    DEMO_SUPPRESS_CHANNEL,
    DEMO_SUPPRESS_REASON,
    DEMO_SUPPRESS_T_MS,
)

_ML_ROOT = Path(__file__).resolve().parents[3]
_REPORTS_DIR = _ML_ROOT / "reports"
_DEMO_FIXTURE = _ML_ROOT / "fixtures" / "demo_session.jsonl"


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    # axes.titlesize: 0 (Design.md section 4, no in-image titles) makes
    # matplotlib log a "Fontsize 0.00 < 1.0pt" notice per figure; harmless.
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    font_substitutions = figures.configure_style()
    for substitution in font_substitutions:
        logging.info("font substitution: %s", substitution)

    collected = metrics.collect()
    figures.save_all(
        _REPORTS_DIR,
        collected.honest,
        collected.staged,
        collected.sensitivity,
        list(DETECTOR_REGISTRY.keys()),
        STANDARD,
    )
    report_path = report.write(_REPORTS_DIR, collected, font_substitutions)
    logging.info("wrote %s", report_path)

    # Phase 6: reports/ is fully a build artifact (docs/Memory.md), so the
    # demo timeline and its walkthrough page are produced here too, not by
    # a separate command. Guarded on the fixture existing so a checkout
    # that hasn't generated it yet doesn't fail this command.
    if _DEMO_FIXTURE.exists():
        demo_observations = metrics.load_observations(_DEMO_FIXTURE)
        demo_actions = [
            DriverAction(t_ms=DEMO_DISMISSAL_T_MS, kind="dismiss_latest"),
            DriverAction(
                t_ms=DEMO_SUPPRESS_T_MS, kind="suppress",
                channel=DEMO_SUPPRESS_CHANNEL, reason=DEMO_SUPPRESS_REASON,
            ),
            DriverAction(t_ms=DEMO_RESUME_T_MS, kind="resume", channel=DEMO_SUPPRESS_CHANNEL),
        ]
        demo_timeline_path = figures.save_demo_timeline(
            _REPORTS_DIR, demo_observations, STANDARD, demo_actions, DEMO_SESSION_END_MS
        )
        logging.info("wrote %s", demo_timeline_path)
        walkthrough_path = report.write_demo_walkthrough(_REPORTS_DIR)
        logging.info("wrote %s", walkthrough_path)


if __name__ == "__main__":
    main()
