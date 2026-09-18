"""One narrative template per detector type, read from the registry.

Templates state what was observed, never what it implies -- PRD.md
section 9 rule 4. Rules.md section 6 rule 4 bans a fixed word list;
tests/test_ethics.py asserts none of them appear in any template.
"""

from __future__ import annotations

from vtml.detectors.schema import REGISTRY
from vtml.types import Channel

TEMPLATES: dict[str, str] = {type_: spec.template for type_, spec in REGISTRY.items()}

BANNED_WORDS = (
    "cheat",
    "cheating",
    "dishonest",
    "suspicious",
    "guilty",
    "caught",
    "violation",
    "misconduct",
    "lying",
    "fraud",
)


def _corroboration_clause(corroborated_by: list[Channel]) -> str:
    if not corroborated_by:
        return ""
    names = ", ".join(c.value for c in corroborated_by)
    return f", corroborated by {names}"


def narrate(type_: str, duration_ms: int | None, corroborated_by: list[Channel]) -> str:
    template = TEMPLATES[type_]
    duration_s = (duration_ms or 0) / 1000
    clause = _corroboration_clause(corroborated_by)
    return template.format(duration_s=duration_s, corroboration=clause)
