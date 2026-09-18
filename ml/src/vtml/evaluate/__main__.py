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

_REPORTS_DIR = Path(__file__).resolve().parents[3] / "reports"


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


if __name__ == "__main__":
    main()
