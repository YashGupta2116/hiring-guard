import { describe, expect, it } from "vitest";
import {
  AUTHORSHIP_BURST_CHARS_PER_SEC,
  AUTHORSHIP_MIN_SOLUTION_CHARS,
  PASTE_LARGE_CHARS,
} from "../../src/config/constants.js";
import { AuthorshipDetector } from "../../src/live/detectors/authorship.detector.js";
import type { EditorChange } from "../../src/live/detectors/types.js";

function typeChange(chars: number, ts = 0): EditorChange {
  return { changeType: "TYPE", rangeOffset: 0, insertedChars: chars, deletedChars: 0, ts };
}

describe("AuthorshipDetector", () => {
  it("emits paste_large on a large editor paste, ignores small ones", () => {
    const detector = new AuthorshipDetector();

    const small = detector.handle("task-1", [{ changeType: "PASTE", rangeOffset: 0, insertedChars: PASTE_LARGE_CHARS - 1, deletedChars: 0, ts: 0 }]);
    expect(small.filter((o) => o.type === "paste_large")).toHaveLength(0);

    const large = detector.handle("task-1", [{ changeType: "PASTE", rangeOffset: 0, insertedChars: PASTE_LARGE_CHARS, deletedChars: 0, ts: 1 }]);
    const pasteObs = large.filter((o) => o.type === "paste_large");
    expect(pasteObs).toHaveLength(1);
    expect(pasteObs[0]).toMatchObject({ channel: "PASTE", type: "paste_large" });
  });

  it("emits typing_burst when sustained typing exceeds the chars/s threshold", () => {
    const detector = new AuthorshipDetector();
    const change: EditorChange = {
      changeType: "TYPE",
      rangeOffset: 0,
      insertedChars: 20,
      deletedChars: 0,
      ts: 0,
      // 20 chars in 1s = 20 chars/s, above the threshold.
      keyIntervalsMs: Array(20).fill(1000 / 20),
    };
    const out = detector.handle("task-1", [change]);
    const burst = out.filter((o) => o.type === "typing_burst");
    expect(burst).toHaveLength(1);
    expect(burst[0]).toMatchObject({ channel: "RHYTHM", type: "typing_burst" });
  });

  it("does not emit typing_burst below the chars/s threshold", () => {
    const detector = new AuthorshipDetector();
    const change: EditorChange = {
      changeType: "TYPE",
      rangeOffset: 0,
      insertedChars: 20,
      deletedChars: 0,
      ts: 0,
      // 20 chars over 5s is well under AUTHORSHIP_BURST_CHARS_PER_SEC.
      keyIntervalsMs: Array(20).fill(5000 / 20),
    };
    expect(20 / 5).toBeLessThan(AUTHORSHIP_BURST_CHARS_PER_SEC);
    const out = detector.handle("task-1", [change]);
    expect(out.filter((o) => o.type === "typing_burst")).toHaveLength(0);
  });

  it("emits typed_ratio_low once the solution is long enough and mostly pasted", () => {
    const detector = new AuthorshipDetector();
    // One big paste well past the min-solution-length, almost nothing typed -> low ratio.
    const out = detector.handle("task-1", [
      { changeType: "PASTE", rangeOffset: 0, insertedChars: AUTHORSHIP_MIN_SOLUTION_CHARS + 50, deletedChars: 0, ts: 0 },
    ]);
    expect(out.some((o) => o.type === "typed_ratio_low")).toBe(true);
  });

  it("does not emit typed_ratio_low below the minimum solution length", () => {
    const detector = new AuthorshipDetector();
    const out = detector.handle("task-1", [{ changeType: "PASTE", rangeOffset: 0, insertedChars: 10, deletedChars: 0, ts: 0 }]);
    expect(out.some((o) => o.type === "typed_ratio_low")).toBe(false);
  });

  it("does not emit typed_ratio_low when the candidate mostly typed", () => {
    const detector = new AuthorshipDetector();
    const changes: EditorChange[] = Array.from({ length: 30 }, (_, i) => typeChange(10, i));
    const out = detector.handle("task-1", changes); // 300 chars, all typed -> ratio 1.0
    expect(out.some((o) => o.type === "typed_ratio_low")).toBe(false);
  });

  it("tracks state independently per sessionTaskId", () => {
    const detector = new AuthorshipDetector();
    detector.handle("task-1", [{ changeType: "PASTE", rangeOffset: 0, insertedChars: AUTHORSHIP_MIN_SOLUTION_CHARS + 50, deletedChars: 0, ts: 0 }]);
    // A fresh task shouldn't inherit task-1's accumulated totals.
    const out = detector.handle("task-2", [typeChange(10)]);
    expect(out.some((o) => o.type === "typed_ratio_low")).toBe(false);
  });
});
