import { afterEach, describe, expect, it, vi } from "vitest";
import { CANDIDATE_TIME_REMAINING_MS } from "../../src/config/constants.js";
import { SessionRuntime } from "../../src/live/session-runtime.js";
import { emitToCandidate } from "../../src/sockets/emitter.js";
import { CANDIDATE_EVENTS } from "../../src/sockets/events.js";

vi.mock("../../src/sockets/emitter.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/sockets/emitter.js")>();
  return { ...original, emitToCandidate: vi.fn(), emitToInterviewers: vi.fn().mockResolvedValue(undefined) };
});

describe("candidate time.remaining", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sends only the remaining time to the candidate, about every CANDIDATE_TIME_REMAINING_MS", async () => {
    vi.useFakeTimers();
    const runtime = new SessionRuntime({
      sessionId: "ses_test_time_remaining_001",
      durationMinutes: 60,
      startedAt: new Date(),
      sensitivity: "STANDARD",
      channels: ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"],
      onEnd: vi.fn().mockResolvedValue(undefined),
    });
    await runtime.start();

    await vi.advanceTimersByTimeAsync(CANDIDATE_TIME_REMAINING_MS * 3 + 500);

    const calls = vi.mocked(emitToCandidate).mock.calls.filter(([, event]) => event === CANDIDATE_EVENTS.TIME_REMAINING);
    // One per 5s window over ~15s, not one per 1s tick.
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.length).toBeLessThanOrEqual(4);

    for (const [sessionId, , payload] of calls) {
      expect(sessionId).toBe("ses_test_time_remaining_001");
      // Nothing but the remaining time may reach a candidate (no score, flag or elapsed-vs-budget detail).
      expect(Object.keys(payload as object)).toEqual(["remainingMs"]);
    }
    const remaining = calls.map(([, , payload]) => (payload as { remainingMs: number }).remainingMs);
    expect(remaining).toEqual([...remaining].sort((a, b) => b - a));

    await runtime.destroy();
  });
});
