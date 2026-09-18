"""Guards detectors/schema.py as the single source of detector type strings.

Phase 2 task 1 (docs handoff): nothing outside `detectors/schema.py`
spells a detector type as a literal string. `priors.py` and
`fusion/narrate.py` now derive their dicts from `REGISTRY`, and
`fixtures/synthetic/generate.py` imports `DetectorType` instead of
hardcoding its script.
"""

from __future__ import annotations

import re
from pathlib import Path

from vtml.detectors.schema import REGISTRY, DetectorType

_SRC = Path(__file__).resolve().parents[1] / "src" / "vtml"
_SCHEMA_FILE = _SRC / "detectors" / "schema.py"


def _literal_pattern() -> re.Pattern[str]:
    types = "|".join(re.escape(t) for t in REGISTRY)
    return re.compile(rf'["\']({types})["\']')


def test_registry_covers_every_prd_detector() -> None:
    # 6 channels, PRD.md section 5's detector column: 3 + 2 + 3 + 4 + 3 + 1.
    assert len(REGISTRY) == 16
    assert set(REGISTRY) == {member.value for member in DetectorType}


def test_no_detector_type_literal_outside_schema() -> None:
    pattern = _literal_pattern()
    offenders: list[str] = []
    for path in _SRC.rglob("*.py"):
        if path == _SCHEMA_FILE:
            continue
        text = path.read_text(encoding="utf-8")
        if pattern.search(text):
            offenders.append(str(path.relative_to(_SRC)))
    assert offenders == []


def test_every_row_has_a_wire_disposition() -> None:
    # Task 6: total over the registry -- every row names a backend enum
    # value or is `None`, which wire.py treats as deliberately absent.
    for type_, spec in REGISTRY.items():
        assert spec.wire_channel is None or isinstance(spec.wire_channel, str), type_
