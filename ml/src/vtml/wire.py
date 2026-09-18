"""Engine Observation -> what crosses into the backend for it.

Backend `MonitoringChannel` (Prisma schema, quoted verbatim in the Phase
2 handoff -- `backend/` itself is out of scope for this component and is
not read or imported here): GAZE, FACE, IDENTITY, SCENE, AUDIO, SCREEN,
FOCUS, PASTE, RHYTHM, POINTER, ENVIRONMENT.

The engine's six channels do not line up with those eleven, and the
engine is not changing to fit them -- its channel set, weights and score
are fixed by the regression baseline (Rules.md section 5). This module
maps at the serialisation boundary instead, reading `wire_channel` off
`detectors/schema.py`'s registry rather than branching on a type string:

- `gaze`, `scene`, `focus` map one to one.
- `input` splits into `PASTE` and `RHYTHM` by detector type, per
  registry row. `POINTER` has no registry row in v1 -- PRD.md section 5
  names no pointer/mouse-movement input detector, so it is a backend
  enum value this component simply doesn't use yet, not an oversight.
- `network` has no enum value and none is invented here. A network
  observation becomes an `UnscoredWindow` with reason `SIGNAL_LOSS` --
  what a dropped connection already is on the engine side
  (`fusion/windows.py`), and matches the standing decision that a
  dropped connection is a reviewer note, never a penalty.
- `audio` is declared in the engine and inert in v1 (PRD.md section 5);
  it never reaches the wire at all -- a channel that always reports zero
  is noise in the reviewer UI.

The backend `Observation` row (quoted verbatim, task 6) carries
`clientTs`, `ts`, `receivedAt` and `payload Json` -- no duration column.
`duration_ms` therefore travels inside `payload`. If it is absent on the
way back in, every event reads as a point event at `scale = 1.0`
(`fusion/engine.py::Engine._observation_llr`) and an interval detector
silently stops scaling -- there is no error, just a quieter score.

`seq` is untouched by this module. The backend assigns it gaplessly at
the gateway with a `prevHash`/`hash` chain, so it is preserved exactly
as the engine received it, never renumbered.
"""

from __future__ import annotations

from typing import Any

from vtml.detectors.schema import REGISTRY
from vtml.types import Channel, Observation, UnscoredWindow

SIGNAL_LOSS = "SIGNAL_LOSS"


def wire_channel_for(type_: str) -> str | None:
    """The backend MonitoringChannel value for a detector type, or None
    when it is deliberately absent from that contract."""
    spec = REGISTRY.get(type_)
    return spec.wire_channel if spec is not None else None


def to_payload(obs: Observation) -> dict[str, Any]:
    """The backend Observation row's `payload Json` column."""
    return {
        "type": obs.type,
        "confidence": obs.confidence,
        "duration_ms": obs.duration_ms,
        "features": dict(obs.features),
        "detector": obs.detector,
        "source": obs.source.value,
    }


def to_unscored_window(obs: Observation) -> UnscoredWindow:
    if obs.channel != Channel.NETWORK:
        raise ValueError(f"to_unscored_window is for network observations, got {obs.channel}")
    return UnscoredWindow(
        channel=Channel.NETWORK, reason=SIGNAL_LOSS, t_start_ms=obs.t_ms, t_end_ms=obs.t_ms
    )


def dispatch(obs: Observation) -> tuple[str, dict[str, Any]] | UnscoredWindow | None:
    """Routes one engine Observation to its backend disposition:
    `(wire_channel, payload)` for gaze/scene/focus/input, an
    `UnscoredWindow` for network, or `None` for audio."""
    if obs.channel == Channel.AUDIO:
        return None
    if obs.channel == Channel.NETWORK:
        return to_unscored_window(obs)
    wire_channel = wire_channel_for(obs.type)
    if wire_channel is None:
        raise ValueError(f"{obs.type!r} has no wire_channel but is not network or audio")
    return wire_channel, to_payload(obs)
