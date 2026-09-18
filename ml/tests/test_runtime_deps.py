"""Rules.md section 3: the import rule, enforced.

`evaluate/` adds matplotlib this phase -- exactly the kind of import that
leaks into the Lambda bundle if a runtime module ever imports it by
accident. This test imports every module under `src/vtml/` except the
declared offline-only ones and asserts none of the banned heavy
dependencies land in `sys.modules` afterwards. It does not get skipped.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import vtml

_EXCLUDED_DIR_PARTS = {"calibrate", "evaluate"}
_EXCLUDED_MODULES = {
    ("handler",),
    ("detectors", "offline_video"),
}

_BANNED = {"sklearn", "pandas", "matplotlib", "cv2", "mediapipe", "boto3"}


def _runtime_module_names() -> list[str]:
    root = Path(vtml.__file__).parent
    names = []
    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root)
        parts = rel.parts[:-1] if rel.name == "__init__.py" else rel.parts[:-1] + (rel.stem,)
        if not parts:
            continue
        if _EXCLUDED_DIR_PARTS & set(parts[:-1]):
            continue
        if parts in _EXCLUDED_MODULES:
            continue
        names.append("vtml." + ".".join(parts))
    return names


def test_runtime_modules_never_pull_in_heavy_dev_dependencies() -> None:
    for module_name in _runtime_module_names():
        importlib.import_module(module_name)

    loaded_top_level = {name.split(".")[0] for name in sys.modules}
    leaked = _BANNED & loaded_top_level
    assert not leaked, f"heavy dependency leaked into the runtime import graph: {leaked}"
