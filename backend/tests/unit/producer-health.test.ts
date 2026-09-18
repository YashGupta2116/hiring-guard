import { describe, expect, it } from "vitest";
import { PRODUCER_HEARTBEAT_TIMEOUT_MS } from "../../src/config/constants.js";
import { ProducerHealthMonitor } from "../../src/live/producer-health.js";

describe("ProducerHealthMonitor", () => {
  it("reports no transitions while heartbeats stay fresh and OK", () => {
    const monitor = new ProducerHealthMonitor();
    monitor.recordHeartbeat("cv", ["GAZE", "FACE"], "OK", 0);
    const { becameDegraded, recovered } = monitor.checkHealth(1000);
    expect(becameDegraded).toEqual([]);
    expect(recovered).toEqual([]);
  });

  it("flags a producer degraded once its heartbeat goes stale", () => {
    const monitor = new ProducerHealthMonitor();
    monitor.recordHeartbeat("asr", ["AUDIO"], "OK", 0);
    const { becameDegraded } = monitor.checkHealth(PRODUCER_HEARTBEAT_TIMEOUT_MS + 1);
    expect(becameDegraded).toEqual([{ producer: "asr", channels: ["AUDIO"] }]);
  });

  it("flags a producer degraded immediately when it self-reports DEGRADED", () => {
    const monitor = new ProducerHealthMonitor();
    monitor.recordHeartbeat("cv", ["GAZE"], "DEGRADED", 0);
    const { becameDegraded } = monitor.checkHealth(0);
    expect(becameDegraded).toEqual([{ producer: "cv", channels: ["GAZE"] }]);
  });

  it("reports recovery exactly once when a fresh OK heartbeat arrives", () => {
    const monitor = new ProducerHealthMonitor();
    monitor.recordHeartbeat("cv", ["GAZE"], "DEGRADED", 0);
    monitor.checkHealth(0);

    monitor.recordHeartbeat("cv", ["GAZE"], "OK", 100);
    const { becameDegraded, recovered } = monitor.checkHealth(100);
    expect(becameDegraded).toEqual([]);
    expect(recovered).toEqual(["cv"]);

    const second = monitor.checkHealth(200);
    expect(second.recovered).toEqual([]);
  });
});
