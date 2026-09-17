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
