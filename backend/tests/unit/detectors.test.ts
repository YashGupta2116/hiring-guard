import { describe, expect, it } from "vitest";
import { EnvDetector } from "../../src/live/detectors/env.detector.js";
import { FocusDetector } from "../../src/live/detectors/focus.detector.js";
import { ksStatistic } from "../../src/live/detectors/ks-test.js";
import { PasteDetector } from "../../src/live/detectors/paste.detector.js";
import { PointerDetector } from "../../src/live/detectors/pointer.detector.js";
import { RhythmDetector } from "../../src/live/detectors/rhythm.detector.js";
import type { DetectorContext } from "../../src/live/detectors/types.js";

const ctx: DetectorContext = { calibrating: false, rhythmBaseline: [] };
const calibratingCtx: DetectorContext = { calibrating: true, rhythmBaseline: [] };

describe("FocusDetector", () => {
  it("ignores a blur shorter than the 800ms threshold", () => {
    const detector = new FocusDetector();
    detector.handle({ kind: "focus", state: "blur", ts: 0 }, ctx);
    const out = detector.handle({ kind: "focus", state: "focus", ts: 500 }, ctx);
    expect(out).toEqual([]);
  });

  it("emits focus_loss for a blur at or above 800ms", () => {
    const detector = new FocusDetector();
    detector.handle({ kind: "focus", state: "blur", ts: 0 }, ctx);
    const out = detector.handle({ kind: "focus", state: "focus", ts: 900 }, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: "FOCUS", type: "focus_loss" });
  });

  it("tracks visibility loss independently of focus/blur", () => {
    const detector = new FocusDetector();
    detector.handle({ kind: "visibility", state: "hidden", ts: 0 }, ctx);
    const out = detector.handle({ kind: "visibility", state: "visible", ts: 5000 }, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].payload).toEqual({ durationMs: 5000 });
  });
});

describe("PasteDetector", () => {
  it("ignores small pastes", () => {
    const detector = new PasteDetector();
    expect(detector.handle({ kind: "clipboard", action: "paste", length: 10, target: "editor", ts: 0 }, ctx)).toEqual([]);
  });

  it("emits paste_large for a large paste outside the editor", () => {
    const detector = new PasteDetector();
    const out = detector.handle({ kind: "clipboard", action: "paste", length: 500, target: "other", ts: 0 }, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: "PASTE", type: "paste_large" });
  });

  it("ignores a large paste into the editor — AuthorshipDetector scores that from the editor.delta instead, to avoid double-counting", () => {
    const detector = new PasteDetector();
    expect(detector.handle({ kind: "clipboard", action: "paste", length: 500, target: "editor", ts: 0 }, ctx)).toEqual([]);
  });

  it("ignores copy actions", () => {
    const detector = new PasteDetector();
    expect(detector.handle({ kind: "clipboard", action: "copy", length: 500, target: "editor", ts: 0 }, ctx)).toEqual([]);
  });
});

describe("PointerDetector", () => {
  // The client never puts a duration on the "leave" event itself — it only knows how long the
  // pointer was away once it returns, so the away-duration is carried on the matching "enter" event.
  it("ignores a leave event, which never carries a duration", () => {
    const detector = new PointerDetector();
    expect(detector.handle({ kind: "pointer", state: "leave", ts: 0 }, ctx)).toEqual([]);
  });

  it("ignores an enter event with no duration (returned from idle, not from leaving)", () => {
    const detector = new PointerDetector();
    expect(detector.handle({ kind: "pointer", state: "enter", ts: 0 }, ctx)).toEqual([]);
  });

  it("ignores a brief pointer leave", () => {
    const detector = new PointerDetector();
    expect(detector.handle({ kind: "pointer", state: "enter", durationMs: 100, ts: 0 }, ctx)).toEqual([]);
  });

  it("emits pointer_leave once past the ignore threshold", () => {
    const detector = new PointerDetector();
    const out = detector.handle({ kind: "pointer", state: "enter", durationMs: 2000, ts: 0 }, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: "POINTER", type: "pointer_leave" });
  });
});

describe("EnvDetector", () => {
  it("flags a second/extended display", () => {
    const detector = new EnvDetector();
    const out = detector.handle({ kind: "screen", screenCount: 2, isExtended: true, ts: 0 }, ctx);
    expect(out[0]).toMatchObject({ channel: "ENVIRONMENT", type: "multi_screen" });
  });

  it("ignores a single non-extended display", () => {
    const detector = new EnvDetector();
    expect(detector.handle({ kind: "screen", screenCount: 1, isExtended: false, ts: 0 }, ctx)).toEqual([]);
  });

  it("flags a device change", () => {
    const detector = new EnvDetector();
    const out = detector.handle({ kind: "device", change: "added", deviceKind: "audioinput", ts: 0 }, ctx);
    expect(out[0]).toMatchObject({ channel: "ENVIRONMENT", type: "device_change" });
  });

  it("flags going offline but not coming back online", () => {
    const detector = new EnvDetector();
    expect(detector.handle({ kind: "network", online: false, ts: 0 }, ctx)[0]).toMatchObject({ type: "network_anomaly" });
    expect(detector.handle({ kind: "network", online: true, ts: 0 }, ctx)).toEqual([]);
  });
});

describe("RhythmDetector", () => {
  it("never runs during calibration", () => {
    const detector = new RhythmDetector();
    const event = { kind: "keystroke_stats" as const, windowMs: 5000, histogram: [], variance: 999, digraphVariance: 0, backspaceRatio: 0, bursts: 0, ts: 0 };
    expect(detector.handle(event, calibratingCtx)).toEqual([]);
  });

  it("emits rhythm_anomaly when the KS statistic crosses the threshold", () => {
    const detector = new RhythmDetector();
    const baseline = [10, 11, 9, 10, 12, 11, 10];
    const anomalyCtx: DetectorContext = { calibrating: false, rhythmBaseline: baseline };
    const event = { kind: "keystroke_stats" as const, windowMs: 5000, histogram: [], variance: 500, digraphVariance: 0, backspaceRatio: 0.1, bursts: 3, ts: 0 };
    const out = detector.handle(event, anomalyCtx);
    expect(out[0]).toMatchObject({ channel: "RHYTHM", type: "rhythm_anomaly" });
  });

  it("emits rhythm_normal when the sample matches the baseline", () => {
    const detector = new RhythmDetector();
    const baseline = [10, 11, 9, 10, 12, 11, 10];
    const cleanCtx: DetectorContext = { calibrating: false, rhythmBaseline: baseline };
    for (const variance of [10, 11, 9, 10, 12]) {
      const out = detector.handle({ kind: "keystroke_stats", windowMs: 5000, histogram: [], variance, digraphVariance: 0, backspaceRatio: 0.1, bursts: 1, ts: 0 }, cleanCtx);
      if (out.length > 0) expect(out[0].type).toBe("rhythm_normal");
    }
  });
});

describe("ksStatistic", () => {
  it("is 0 for identical samples", () => {
    expect(ksStatistic([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("is 1 for completely disjoint, non-overlapping distributions", () => {
    expect(ksStatistic([1, 1, 1], [100, 100, 100])).toBe(1);
  });

  it("is 0 when either sample is empty", () => {
    expect(ksStatistic([], [1, 2, 3])).toBe(0);
    expect(ksStatistic([1, 2, 3], [])).toBe(0);
  });
});
