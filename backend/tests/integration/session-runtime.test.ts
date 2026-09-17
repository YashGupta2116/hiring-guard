import { afterEach, describe, expect, it, vi } from "vitest";
import { CANDIDATE_ABANDON_GRACE_MS } from "../../src/config/constants.js";
import { SessionRuntime } from "../../src/live/session-runtime.js";

describe("SessionRuntime candidate abandon grace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onEnd('candidate_abandon') after the grace period with no reconnect", async () => {
    vi.useFakeTimers();
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const runtime = new SessionRuntime({ sessionId: "ses_test_runtime_0000000001", durationMinutes: 60, startedAt: new Date(), onEnd });
    await runtime.start();

    runtime.onCandidateDisconnected();
    expect(onEnd).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CANDIDATE_ABANDON_GRACE_MS);
    expect(onEnd).toHaveBeenCalledWith("candidate_abandon");

    await runtime.destroy();
  });

  it("cancels the abandon timer when the candidate reconnects in time", async () => {
    vi.useFakeTimers();
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const runtime = new SessionRuntime({ sessionId: "ses_test_runtime_0000000002", durationMinutes: 60, startedAt: new Date(), onEnd });
    await runtime.start();

    runtime.onCandidateDisconnected();
    await vi.advanceTimersByTimeAsync(CANDIDATE_ABANDON_GRACE_MS - 1000);
    runtime.onCandidateConnected();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onEnd).not.toHaveBeenCalled();
    await runtime.destroy();
  });

  it("fires onEnd('duration_limit') once the interview's duration elapses", async () => {
    vi.useFakeTimers();
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const runtime = new SessionRuntime({ sessionId: "ses_test_runtime_0000000003", durationMinutes: 1, startedAt: new Date(), onEnd });
    await runtime.start();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onEnd).toHaveBeenCalledWith("duration_limit");

    await runtime.destroy();
  });
});
