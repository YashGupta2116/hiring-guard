"""Rules.md section 3: the import rule, enforced.

`evaluate/` adds matplotlib and `calibrate/` adds scikit-learn -- exactly the
kind of import that leaks into the Lambda bundle if a runtime module ever
imports one by accident. This test imports every module under `src/vtml/`
except the declared offline-only ones and asserts none of the banned heavy
dependencies land in `sys.modules` afterwards. It does not get skipped.

**Why a subprocess.** `sys.modules` is process-wide, so reading it in-process
measures the whole pytest session rather than this import graph: once any other
test file imports `vtml.calibrate.fit`, scikit-learn is already loaded and the
assertion fires on an import this test never made. A fresh interpreter is the
only place the question "what does importing the runtime pull in" has a
meaningful answer, and it also makes the result independent of test ordering.
"""

from __future__ import annotations

import json
import subprocess
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


_PROBE = """
import importlib, json, sys
names = json.loads(sys.argv[1])
for name in names:
    importlib.import_module(name)
print(json.dumps(sorted({m.split(".")[0] for m in sys.modules})))
"""


def _top_level_modules_after_importing(names: list[str]) -> set[str]:
    completed = subprocess.run(
        [sys.executable, "-c", _PROBE, json.dumps(names)],
        capture_output=True,
        text=True,
        check=True,
    )
    return set(json.loads(completed.stdout.strip().splitlines()[-1]))


def test_runtime_modules_never_pull_in_heavy_dev_dependencies() -> None:
    names = _runtime_module_names()
    assert names, "the runtime module list must not be empty"
    leaked = _BANNED & _top_level_modules_after_importing(names)
    assert not leaked, f"heavy dependency leaked into the runtime import graph: {leaked}"


def test_the_probe_would_notice_a_leak() -> None:
    """The assertion above passes trivially if the subprocess never reports
    anything. Import an excluded module on purpose and check it is seen."""
    loaded = _top_level_modules_after_importing(["vtml.calibrate.fit"])
    assert "sklearn" in loaded
