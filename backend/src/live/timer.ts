/** Pure timer math — no I/O, unit-testable. Topic-budget burn is added in Phase 7 once topics are tracked live. */

export type TimerState = {
  elapsedMs: number;
  remainingMs: number;
  durationExceeded: boolean;
};

export function computeTimerState(startedAt: Date, durationMinutes: number, now: Date = new Date()): TimerState {
  const totalMs = durationMinutes * 60_000;
  const elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return { elapsedMs, remainingMs, durationExceeded: elapsedMs >= totalMs };
}
