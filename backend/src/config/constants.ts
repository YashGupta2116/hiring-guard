/** Timings, caps and other tunables that are not detection-related. See detection.ts for LLR/scoring tunables. */
import { isTest } from "./env.js";

export const JD_MAX_BYTES = 10 * 1024 * 1024;

export const JD_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const SESSION_LIST_DEFAULT_LIMIT = 20;
export const SESSION_LIST_MAX_LIMIT = 100;

/** Minutes reserved for intro/wrap-up when splitting JD topic budgets across the interview. */
export const JD_TOPIC_BUDGET_RESERVED_MINUTES = 10;

/** Displayed on the candidate policy screen; the actual per-data-type periods live in Phase 11's retention job. */
export const DEFAULT_RETENTION_DAYS = 90;

export const PREFLIGHT_MIN_DOWNLINK_MBPS = 2;
export const PREFLIGHT_MIN_CPU_CORES = 4;

/** Candidate token stays valid past the interview end so a slow finish/report page load doesn't 401. */
export const CANDIDATE_TOKEN_GRACE_HOURS = 2;

/** 60s in real life; shrunk in tests (like the /auth rate limiter) so flag/warden tests don't need a real wait. */
export const CALIBRATION_MS = isTest ? 200 : 60_000;
export const FUSION_LEASE_TTL_MS = 5000;
export const FUSION_LEASE_RENEW_MS = 2000;
export const TIMER_TICK_MS = 1000;
export const CANDIDATE_TIME_REMAINING_MS = 5000;
export const CANDIDATE_ABANDON_GRACE_MS = 120_000;
export const DASHBOARD_FRAME_BUFFER_SIZE = 2000;

// ---- Phase 6: telemetry ingest ----

/** Focus/visibility loss shorter than this is normal tab-switching noise (FR-DET-1). */
export const FOCUS_IGNORE_MS = 800;
/** Pointer leaving the window shorter than this is ignored. */
export const POINTER_LEAVE_IGNORE_MS = 800;
/** Clipboard paste into any surface at or above this length is "large". */
export const PASTE_LARGE_CHARS = 40;
/** Minimum calibration samples before the rhythm detector will compare against the baseline. */
export const RHYTHM_BASELINE_MIN_SAMPLES = 5;
/** Two-sample KS statistic above this is treated as a rhythm anomaly. */
export const RHYTHM_KS_THRESHOLD = 0.5;

/** A producer that hasn't sent a heartbeat within this window is considered degraded. */
export const PRODUCER_HEARTBEAT_TIMEOUT_MS = 15_000;
/** How often SessionRuntime checks producer heartbeats for staleness. */
export const PRODUCER_HEALTH_CHECK_MS = 5000;

// ---- Phase 7: fusion, flags, warden ----

/** How often the dashboard gets a fresh integrity.tick (Design.md §5.2). */
export const INTEGRITY_TICK_MS = 2000;
/** How often a persisted IntegritySnapshot row is written. */
export const INTEGRITY_SNAPSHOT_MS = 10_000;
/** 45s in real life; shrunk in tests for the same reason as CALIBRATION_MS above. */
export const WARDEN_COOLDOWN_MS = isTest ? 100 : 45_000;
/** Once this many warnings above tier 1 (WARNING/INTERRUPT) have been shown, further ones downgrade to NOTICE. */
export const WARDEN_CAP_ABOVE_TIER1 = 6;
/** `llm.suggestQuestions()` must answer within this long or the question-bank fallback is used. */
export const SUGGESTION_LLM_TIMEOUT_MS = 2500;
/** Suggestions are always shown three at a time. */
export const SUGGESTION_BATCH_SIZE = 3;
