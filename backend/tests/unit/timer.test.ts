import { describe, expect, it } from "vitest";
import { computeTimerState } from "../../src/live/timer.js";

describe("computeTimerState", () => {
  it("computes elapsed and remaining from startedAt", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:05:00.000Z");
    const state = computeTimerState(startedAt, 30, now);
    expect(state.elapsedMs).toBe(5 * 60_000);
    expect(state.remainingMs).toBe(25 * 60_000);
    expect(state.durationExceeded).toBe(false);
  });

  it("clamps remaining to zero and flags durationExceeded once time is up", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:45:00.000Z");
    const state = computeTimerState(startedAt, 30, now);
    expect(state.remainingMs).toBe(0);
    expect(state.durationExceeded).toBe(true);
  });
});
