/** Timings, caps and other tunables that are not detection-related. See detection.ts for LLR/scoring tunables. */

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
