"""ingest.normalise(): validate, clock-correct, dedupe and reorder-buffer
a raw observation batch before it ever reaches `Engine.ingest`.

Architecture.md section 2 step 4 names this as the pipeline stage in
front of the engine: `ingest.normalise()` validates the schema, applies
the clock offset, computes `t_ms`, drops duplicates by `(source, seq)`,
and buffers out-of-order items for up to 2 s. `Engine.ingest` (Phase 1)
already does its own light dedup-by-seq and sort over a batch of
already-valid `Observation` objects -- that stays untouched, since
`tests/test_regression_baseline.py` pins its behaviour. This module
handles what Phase 1 never had raw wire data for: turning an untrusted
JSON batch into the `Observation`s Engine.ingest expects.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from vtml.detectors.schema import REGISTRY, DetectorType
from vtml.types import Channel, IngestResult, Observation

logger = logging.getLogger(__name__)

# Rules.md section 2 step 4 / task 2: buffer out-of-order observations for
# up to 2 s; beyond that, accept anyway (a late observation is still
# evidence) but count it separately.
_REORDER_BUFFER_MS = 2_000

# Rules.md section 7: a corrected timestamp more than 5 s from receipt is
# a clock anomaly, not evidence about the candidate.
_CLOCK_ANOMALY_MS = 5_000


def _clock_anomaly_observation(obs: Observation) -> Observation:
    return obs.model_copy(
        update={
            "channel": Channel.NETWORK,
            "type": DetectorType.NETWORK_CLOCK_ANOMALY,
            "confidence": 1.0,
            "duration_ms": None,
            "features": {},
        }
    )


def normalise(
    raw_observations: list[dict[str, object]],
    *,
    received_at_ms: int,
    clock_offset_ms: int = 0,
) -> tuple[list[Observation], IngestResult]:
    """Returns the cleaned, time-ordered observations plus every count.

    `received_at_ms` is when this batch reached the server -- Architecture
    section 2 describes batches, not single observations, arriving
    together, so one receipt timestamp per call is enough to catch a
    clock anomaly without per-observation receipt tracking nothing here
    needs.
    """
    dropped_invalid = 0
    dropped_duplicate = 0
    unknown_detector = 0
    clock_anomaly = 0
    seen: set[tuple[str, int]] = set()
    validated: list[Observation] = []

    for raw in raw_observations:
        try:
            obs = Observation.model_validate(raw)
        except ValidationError:
            dropped_invalid += 1
            logger.warning("dropped invalid observation, detector=%s", raw.get("detector"))
            continue

        obs = obs.model_copy(update={"t_ms": obs.t_ms + clock_offset_ms})

        dedup_key = (obs.source.value, obs.seq)
        if dedup_key in seen:
            dropped_duplicate += 1
            continue
        seen.add(dedup_key)

        if abs(obs.t_ms - received_at_ms) > _CLOCK_ANOMALY_MS:
            obs = _clock_anomaly_observation(obs)
            clock_anomaly += 1
        elif obs.type not in REGISTRY:
            # Never guess a prior for an unrecognised type -- drop and
            # count it instead (skipped for the clock-anomaly stand-in
            # above, whose type is always registered).
            unknown_detector += 1
            continue

        validated.append(obs)

    reordered = 0
    late_beyond_buffer = 0
    watermark: int | None = None
    for obs in validated:
        if watermark is not None and obs.t_ms < watermark:
            reordered += 1
            if watermark - obs.t_ms > _REORDER_BUFFER_MS:
                late_beyond_buffer += 1
        watermark = obs.t_ms if watermark is None else max(watermark, obs.t_ms)

    ordered = sorted(validated, key=lambda o: o.t_ms)

    result = IngestResult(
        accepted=len(ordered),
        dropped=dropped_invalid + dropped_duplicate + unknown_detector,
        reordered=reordered,
        dropped_invalid=dropped_invalid,
        dropped_duplicate=dropped_duplicate,
        unknown_detector=unknown_detector,
        clock_anomaly=clock_anomaly,
        late_beyond_buffer=late_beyond_buffer,
    )
    return ordered, result
