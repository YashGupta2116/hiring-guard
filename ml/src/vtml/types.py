"""Data contracts that cross a module or process boundary.

Everything here is a Pydantic model or enum. Nothing that lives only inside
fusion internals (evidence items, channel accumulators) belongs in this file.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Channel(str, Enum):
    GAZE = "gaze"
    SCENE = "scene"
    FOCUS = "focus"
    INPUT = "input"
    NETWORK = "network"
    AUDIO = "audio"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Source(str, Enum):
    BROWSER = "browser"
    OFFLINE = "offline"
    SYNTHETIC = "synthetic"


class Observation(BaseModel):
    seq: int
    t_ms: int
    channel: Channel
    type: str
    confidence: float
    duration_ms: int | None = None
    features: dict[str, float] = Field(default_factory=dict)
    detector: str
    source: Source

    @field_validator("features", mode="before")
    @classmethod
    def _reject_non_float_features(cls, value: object) -> object:
        # PRD 9.5: no transcript text, filename, or keystroke identity may
        # enter the engine. Enforced here at the type level, not by convention.
        if not isinstance(value, dict):
            raise TypeError("features must be a dict")
        for key, item in value.items():
            if isinstance(item, bool) or not isinstance(item, (int, float)):
                raise ValueError(
                    f"features[{key!r}] must be a float, got {type(item).__name__}"
                )
        return value


class Flag(BaseModel):
    id: str
    t_start_ms: int
    t_end_ms: int
    channel: Channel
    type: str
    severity: Severity
    llr: float
    score_delta: float
    corroborated_by: list[Channel] = Field(default_factory=list)
    observation_ids: list[int] = Field(default_factory=list)
    narrative: str
    media_offset_ms: int


class UnscoredWindow(BaseModel):
    channel: Channel
    reason: str
    t_start_ms: int
    t_end_ms: int | None = None


class SessionResult(BaseModel):
    score: float | None
    status: Literal["calibrating", "scoring", "degraded"]
    band: Literal["clear", "review", "suppressed"]
    channels: dict[Channel, float]
    flags: list[Flag] = Field(default_factory=list)
    unscored: list[UnscoredWindow] = Field(default_factory=list)
    calibration: Literal["complete", "fallback"]
    weights_version: str
    diagnostics: dict[str, int] = Field(default_factory=dict)


class IngestResult(BaseModel):
    accepted: int
    dropped: int
    reordered: int
    # Populated by ingest.normalise() (Phase 2); Engine.ingest's own
    # dedup-by-seq/sort pass predates the breakdown and leaves these at
    # their default, folded into its plainer `dropped`/`reordered` counts.
    dropped_invalid: int = 0
    dropped_duplicate: int = 0
    unknown_detector: int = 0
    clock_anomaly: int = 0
    late_beyond_buffer: int = 0
