"""ChannelState: the per-channel LLR accumulator.

`recent` is a ring buffer covering roughly the last minute of evidence --
long enough to cover both the corroboration window (6 s) and the flag
merge window (15 s) with headroom for callers that inspect it directly.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

from vtml.config import EngineConfig
from vtml.types import Channel


@dataclass(frozen=True)
class EvidenceItem:
    t_ms: int
    llr: float
    type: str
    observation_id: int


class ChannelState:
    def __init__(self, channel: Channel, config: EngineConfig) -> None:
        self.channel = channel
        self.llr: float = 0.0
        self.last_update: int | None = None
        self.recent: deque[EvidenceItem] = deque()
        self.suppressed: bool = False
        self._tau_s = config.decay_tau_s[channel]
        self._ring_ms = config.evidence_ring_buffer_ms

    def decay_to(self, t_ms: int) -> None:
        if self.suppressed:
            return
        if self.last_update is not None and t_ms > self.last_update:
            dt_s = (t_ms - self.last_update) / 1000
            self.llr *= math.exp(-dt_s / self._tau_s)
        self.last_update = t_ms
        self._prune(t_ms)

    def add(self, evidence: EvidenceItem) -> None:
        if self.suppressed:
            return
        self.llr += evidence.llr
        self.recent.append(evidence)
        self.last_update = evidence.t_ms
        self._prune(evidence.t_ms)

    def _prune(self, now_ms: int) -> None:
        while self.recent and now_ms - self.recent[0].t_ms > self._ring_ms:
            self.recent.popleft()

    def copy(self, config: EngineConfig) -> "ChannelState":
        """A clone that `decay_to()` can mutate freely without touching
        this instance -- Engine.snapshot()'s non-destructive read decays
        a copy rather than the live state (docs/Memory.md). `config` must
        be the same one this instance was built with; `_tau_s`/`_ring_ms`
        are derived from it at construction and are not copied directly.
        `EvidenceItem` is frozen, so copying `recent` into a new deque is
        enough -- no item is ever mutated in place."""
        clone = ChannelState(self.channel, config)
        clone.llr = self.llr
        clone.last_update = self.last_update
        clone.recent = deque(self.recent)
        clone.suppressed = self.suppressed
        return clone
