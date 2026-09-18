"""Thin lookup over the detector registry's hand-set LLR priors.

Phase 1 hand-authored this dict directly, one entry per detector type
from PRD.md section 5. Phase 2's `detectors/schema.py` is now the real
registry -- the single source for a prior, its reasoning comment, and
everything else about a detector type -- so this module just re-shapes
it into the `{type: prior}` view `fusion/engine.py` already reads.
"""

from __future__ import annotations

from vtml.detectors.schema import REGISTRY

PRIORS: dict[str, float] = {type_: spec.prior for type_, spec in REGISTRY.items()}
