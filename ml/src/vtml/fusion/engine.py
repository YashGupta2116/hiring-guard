"""Engine: the public surface of the fusion core.

Runs identically offline and in the Lambda (Architecture.md section 1).
All state lives on the instance: channel accumulators, open windows, the
flag list, the score history, and the seeded RNG.
"""

from __future__ import annotations

import logging
import math
from collections import deque
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from vtml.baseline import (
    Baseline,
    BaselineBuilder,
    is_within_personal_gaze_tolerance,
    rhythm_is_anomalous,
)
from vtml.config import EngineConfig
from vtml.detectors.schema import REGISTRY as DETECTOR_REGISTRY
from vtml.detectors.schema import DetectorType
from vtml.fusion import corroborate, flags as flags_mod, narrate as narrate_mod, score as score_mod
from vtml.fusion import windows as windows_mod
from vtml.fusion.channel import ChannelState, EvidenceItem
from vtml.priors import PRIORS
from vtml.types import (
    Channel,
    Flag,
    IngestResult,
    Observation,
    SessionResult,
    UnscoredWindow,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Weights:
    """Stand-in for the Phase 3 weights.json artifact.

    Phase 0/1 has no fitted calibration curves -- every detector scores
    off its priors.py entry -- so this carries only the version string
    that SessionResult.weights_version must report either way.
    """

    version: str = "phase1-priors"


class Engine:
    def __init__(self, config: EngineConfig, weights: Weights | None, *, seed: int = 0) -> None:
        if weights is None:
            raise ValueError("Engine requires weights; refuses to score with priors silently")
        self._config = config
        self._weights = weights
        self._channels: dict[Channel, ChannelState] = {
            channel: ChannelState(channel, config) for channel in Channel
        }
        self._flags: list[Flag] = []
        self._windows: list[UnscoredWindow] = []
        self._score: float = config.initial_score
        self._degraded: bool = False
        self._seen_seq: set[int] = set()
        self._flag_counter: int = 0
        self._t_now: int = 0
        self._diagnostics: dict[str, int] = {}
        self._rng: np.random.Generator = np.random.default_rng(seed)

        # Phase 2 task 3/4: the first calibration_window_s of a session is
        # observe-only -- evidence accumulates but no flag emits (see
        # _process_one). `_baseline` is set exactly once, either by the
        # first observation whose t_ms reaches the window or by
        # finalise() if the session closes before it does.
        self._baseline_builder = BaselineBuilder(config)
        self._baseline: Baseline | None = None
        self._baseline_closed: bool = False
        self._rhythm_window: deque[tuple[int, float]] = deque()

    # -- ingest ------------------------------------------------------

    def ingest(self, observations: list[Observation]) -> IngestResult:
        accepted = 0
        dropped = 0
        reordered = sum(
            1
            for i in range(1, len(observations))
            if observations[i].t_ms < observations[i - 1].t_ms
        )
        if observations:
            self._t_now = max(self._t_now, max(o.t_ms for o in observations))

        for obs in sorted(observations, key=lambda o: o.t_ms):
            try:
                ok = self._process_one(obs)
            except Exception:
                logger.exception("dropping observation seq=%s after processing error", obs.seq)
                ok = False
            if ok:
                accepted += 1
            else:
                dropped += 1

        return IngestResult(accepted=accepted, dropped=dropped, reordered=reordered)

    def _bump(self, key: str) -> None:
        self._diagnostics[key] = self._diagnostics.get(key, 0) + 1

    def _process_one(self, obs: Observation) -> bool:
        if obs.seq in self._seen_seq:
            self._bump("dropped_duplicate")
            return False
        self._seen_seq.add(obs.seq)

        channel = obs.channel
        state = self._channels[channel]
        if state.suppressed:
            self._bump("dropped_suppressed")
            return False

        # Every channel decays to `now`, not just the one receiving new
        # evidence (Architecture.md section 2 step 4) -- otherwise a
        # channel with no recent events contributes a stale, undecayed
        # LLR to the weighted sum until its own next observation.
        for other in self._channels.values():
            other.decay_to(obs.t_ms)

        prior = PRIORS.get(obs.type)
        if prior is None:
            self._bump("unknown_detector")
            return False

        # Architecture.md section 2 step 2 / PRD section 3: the first
        # calibration_window_s of session time is observe-only, literally --
        # an in-window observation feeds BaselineBuilder and nothing else.
        # It never reaches state.add(), so it never enters `recent` (a later
        # observation cannot corroborate against it -- the window is a hard
        # boundary for evidence) and contributes no LLR, directly or via
        # decay (there is nothing on the channel yet to decay). The decay
        # loop above still runs every step regardless, so `last_update`
        # tracks forward through the window; the first scored observation
        # therefore decays from wherever the window left off, not from a
        # frozen "session open" timestamp.
        calibrating = obs.t_ms < self._config.calibration_window_s * 1000
        if not self._baseline_closed:
            self._baseline_builder.observe(obs)
            if not calibrating:
                self._baseline = self._baseline_builder.finalise(obs.t_ms)
                self._baseline_closed = True

        if calibrating:
            return True

        llr = self._observation_llr(obs.duration_ms, prior)
        llr = self._apply_personalisation(obs, llr)
        boost, corroborated_by = corroborate.compute_boost(
            self._channels, channel, obs.t_ms, self._config
        )
        evidence = EvidenceItem(
            t_ms=obs.t_ms, llr=llr * boost, type=obs.type, observation_id=obs.seq
        )
        state.add(evidence)

        self._score, degraded = score_mod.safe_score(self._channels, self._config, self._score)
        self._degraded = self._degraded or degraded

        if evidence.llr >= self._config.flag_threshold:
            narrative = narrate_mod.narrate(obs.type, obs.duration_ms, corroborated_by)
            self._flag_counter += 1
            flags_mod.emit_or_merge(
                self._flags,
                self._channels,
                self._config,
                evidence,
                channel,
                corroborated_by,
                self._score,
                narrative,
                media_offset_ms=obs.t_ms,
                new_flag_id=f"flag-{self._flag_counter}",
            )
        return True

    def _observation_llr(self, duration_ms: int | None, prior: float) -> float:
        if duration_ms is None:
            # A point event (e.g. a paste) has no duration to scale by.
            # Folding it into the curve at duration=0 would score it as
            # nothing; a discrete completed action is scored at full
            # weight instead. See docs/Memory.md.
            scale = 1.0
        else:
            duration = max(duration_ms, 0)
            numerator = math.log1p(duration / self._config.duration_scale_ms)
            denominator = math.log1p(
                self._config.duration_saturation_ms / self._config.duration_scale_ms
            )
            scale = min(1.0, numerator / denominator)
        raw = prior * scale
        return min(max(raw, self._config.llr_clamp_min), self._config.llr_clamp_max)

    def _apply_personalisation(self, obs: Observation, llr: float) -> float:
        """Task 4: only detectors with `needs_baseline=True` in the
        registry take this path, and only once a baseline exists."""
        if self._baseline is None:
            return llr
        spec = DETECTOR_REGISTRY.get(obs.type)
        if spec is None or not spec.needs_baseline:
            return llr

        if obs.channel == Channel.GAZE:
            yaw = obs.features.get("yaw_deg")
            if yaw is None:
                return llr
            if is_within_personal_gaze_tolerance(yaw, self._baseline, self._config):
                # Within the candidate's own resting angle: not evidence.
                return 0.0
            return llr

        if obs.type == DetectorType.INPUT_RHYTHM_SHIFT.value:
            interval = obs.features.get("interval_ms")
            chars_per_sec = obs.features.get("chars_per_sec")
            if interval is None or chars_per_sec is None:
                return llr
            self._rhythm_window.append((obs.t_ms, interval))
            cutoff = obs.t_ms - self._config.rhythm_window_s * 1000
            while self._rhythm_window and self._rhythm_window[0][0] < cutoff:
                self._rhythm_window.popleft()
            recent = [v for _, v in self._rhythm_window]
            if rhythm_is_anomalous(recent, chars_per_sec, self._baseline, self._config):
                return llr
            return 0.0

        return llr

    # -- suppression ---------------------------------------------------

    def suppress(self, channel: Channel, reason: str) -> None:
        windows_mod.suppress(self._windows, self._channels, channel, reason, self._t_now)

    def resume(self, channel: Channel) -> None:
        windows_mod.resume(self._windows, self._channels, channel, self._t_now)

    # -- scoring surface -------------------------------------------------

    def recompute(
        self,
        dismissed_ids: list[str] | None = None,
        downgraded_ids: list[str] | None = None,
    ) -> SessionResult:
        """Pure function of stored evidence: no session replay."""
        dismissed = set(dismissed_ids or [])
        downgraded = set(downgraded_ids or [])

        adjusted_llr = {channel: state.llr for channel, state in self._channels.items()}
        for flag in self._flags:
            if flag.id in dismissed:
                adjusted_llr[flag.channel] -= flag.llr
            elif flag.id in downgraded:
                adjusted_llr[flag.channel] -= flag.llr * self._config.downgrade_factor

        raw = sum(
            self._config.channel_weight[channel] * llr for channel, llr in adjusted_llr.items()
        )
        score = score_mod.to_score(raw, self._config)
        if not math.isfinite(score):
            score = self._score
        band = score_mod.to_band(score, self._config)
        status: Literal["scoring", "degraded"] = "degraded" if self._degraded else "scoring"
        return self._build_result(score=score, band=band, status=status)

    def finalise(self, t_ms: int) -> SessionResult:
        if not self._baseline_closed:
            # Session closed before calibration_window_s elapsed: force
            # the builder to close now. BaselineBuilder.finalise() itself
            # decides complete vs fallback from t_ms, same as the normal
            # in-window closing path.
            self._baseline = self._baseline_builder.finalise(t_ms)
            self._baseline_closed = True
        for state in self._channels.values():
            state.decay_to(t_ms)
        windows_mod.close_all(self._windows, t_ms)
        self._score, degraded = score_mod.safe_score(self._channels, self._config, self._score)
        self._degraded = self._degraded or degraded
        band = score_mod.to_band(self._score, self._config)
        status: Literal["scoring", "degraded"] = "degraded" if self._degraded else "scoring"
        return self._build_result(score=self._score, band=band, status=status)

    def snapshot(self, t_ms: int) -> SessionResult:
        """A non-destructive read of engine state at `t_ms`.

        Unlike `finalise()`, this never closes unscored windows, force-
        closes the baseline, or writes `self._score`/`self._degraded` --
        a session snapshotted any number of times finalises identically
        to one that was never snapshotted at all (docs/Memory.md has the
        determinism reasoning). Decays a *copy* of each channel rather
        than relying on `decay_to()` being safe to call twice for the
        same eventual timestamp: floating-point decay split across two
        `math.exp()` calls is not guaranteed bit-identical to one taken
        in a single step, and the determinism test wants byte-identical
        JSON, not merely equal scores.
        """
        if t_ms < self._config.calibration_window_s * 1000:
            return self._build_result(score=None, band="calibrating", status="calibrating")

        channels = {channel: state.copy(self._config) for channel, state in self._channels.items()}
        for state in channels.values():
            state.decay_to(t_ms)
        score, degraded = score_mod.safe_score(channels, self._config, self._score)
        band = score_mod.to_band(score, self._config)
        status: Literal["scoring", "degraded"] = (
            "degraded" if self._degraded or degraded else "scoring"
        )
        return self._build_result(score, band, status, channel_states=channels)

    def _build_result(
        self,
        score: float | None,
        band: score_mod.Band,
        status: Literal["calibrating", "scoring", "degraded"],
        *,
        channel_states: dict[Channel, ChannelState] | None = None,
    ) -> SessionResult:
        states = channel_states if channel_states is not None else self._channels
        calibration: Literal["complete", "fallback"] = (
            "fallback" if self._baseline is not None and self._baseline.fallback else "complete"
        )
        return SessionResult(
            score=score,
            status=status,
            band=band,
            channels={channel: state.llr for channel, state in states.items()},
            flags=list(self._flags),
            unscored=list(self._windows),
            calibration=calibration,
            weights_version=self._weights.version,
            diagnostics=dict(self._diagnostics),
        )

    # -- state ------------------------------------------------------

    def to_state(self) -> dict[str, Any]:
        return {
            "channels": {
                channel.value: {
                    "llr": state.llr,
                    "last_update": state.last_update,
                    "suppressed": state.suppressed,
                    "recent": [
                        {
                            "t_ms": e.t_ms,
                            "llr": e.llr,
                            "type": e.type,
                            "observation_id": e.observation_id,
                        }
                        for e in state.recent
                    ],
                }
                for channel, state in self._channels.items()
            },
            "flags": [flag.model_dump(mode="json") for flag in self._flags],
            "windows": [window.model_dump(mode="json") for window in self._windows],
            "score": self._score,
            "degraded": self._degraded,
            "seen_seq": sorted(self._seen_seq),
            "flag_counter": self._flag_counter,
            "t_now": self._t_now,
            "diagnostics": dict(self._diagnostics),
            "rng_state": self._rng.bit_generator.state,
            "weights_version": self._weights.version,
        }

    @classmethod
    def from_state(cls, state: dict[str, Any], config: EngineConfig, weights: Weights) -> "Engine":
        engine = cls(config, weights)
        for channel_value, channel_state in state["channels"].items():
            channel = Channel(channel_value)
            target = engine._channels[channel]
            target.llr = channel_state["llr"]
            target.last_update = channel_state["last_update"]
            target.suppressed = channel_state["suppressed"]
            target.recent = deque(EvidenceItem(**item) for item in channel_state["recent"])
        engine._flags = [Flag.model_validate(f) for f in state["flags"]]
        engine._windows = [UnscoredWindow.model_validate(w) for w in state["windows"]]
        engine._score = state["score"]
        engine._degraded = state["degraded"]
        engine._seen_seq = set(state["seen_seq"])
        engine._flag_counter = state["flag_counter"]
        engine._t_now = state["t_now"]
        engine._diagnostics = dict(state["diagnostics"])
        engine._rng.bit_generator.state = state["rng_state"]
        return engine
