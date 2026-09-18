"""Offline evaluation harness: metrics, figures and the report writer.

Imports matplotlib, and through `metrics.py` nothing heavier -- kept out
of `tests/test_runtime_deps.py`'s import graph on purpose (Rules.md
section 3). Not imported by anything under the runtime path.
"""
