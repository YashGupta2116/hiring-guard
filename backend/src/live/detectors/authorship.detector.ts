import {
  AUTHORSHIP_BURST_CHARS_PER_SEC,
  AUTHORSHIP_BURST_MIN_CHARS,
  AUTHORSHIP_MIN_SOLUTION_CHARS,
  AUTHORSHIP_TYPED_RATIO_THRESHOLD,
  PASTE_LARGE_CHARS,
} from "../../config/constants.js";
import type { DetectorObservation, EditorChange } from "./types.js";

type TaskState = {
  /** Net chars typed via TYPE changes, cumulative. */
  typedChars: number;
  /** Net chars across every change type, cumulative — an approximation of current solution length. */
  totalChars: number;
};

/**
 * FR-DET-2: large paste into the editor, typed_ratio below 0.35 on a long solution, sustained typing
 * bursts. Pure aside from per-task running totals (no channel for "authorship" exists in the schema, so
 * these reuse PASTE and RHYTHM — see Memory.md Phase 8 decisions). Keyed by sessionTaskId since a
 * session can have more than one coding task.
 */
export class AuthorshipDetector {
  private readonly tasks = new Map<string, TaskState>();

  handle(sessionTaskId: string, changes: EditorChange[]): DetectorObservation[] {
    const state = this.tasks.get(sessionTaskId) ?? { typedChars: 0, totalChars: 0 };
    const observations: DetectorObservation[] = [];

    for (const change of changes) {
      state.totalChars = Math.max(0, state.totalChars + change.insertedChars - change.deletedChars);
      if (change.changeType === "TYPE") {
        state.typedChars += change.insertedChars;
      }

      if (change.changeType === "PASTE" && change.insertedChars >= PASTE_LARGE_CHARS) {
        observations.push({
          channel: "PASTE",
          type: "paste_large",
          strength: Math.min(1, change.insertedChars / 2000),
          ts: change.ts,
          payload: { sessionTaskId, insertedChars: change.insertedChars, source: "editor" },
        });
      }

      if (change.changeType === "TYPE" && change.keyIntervalsMs && change.insertedChars >= AUTHORSHIP_BURST_MIN_CHARS) {
        const durationSec = change.keyIntervalsMs.reduce((sum, ms) => sum + ms, 0) / 1000;
        if (durationSec > 0) {
          const charsPerSecond = change.insertedChars / durationSec;
          if (charsPerSecond > AUTHORSHIP_BURST_CHARS_PER_SEC) {
            observations.push({
              channel: "RHYTHM",
              type: "typing_burst",
              strength: Math.min(1, charsPerSecond / 40),
              ts: change.ts,
              payload: { sessionTaskId, charsPerSecond, insertedChars: change.insertedChars },
            });
          }
        }
      }

      if (state.totalChars >= AUTHORSHIP_MIN_SOLUTION_CHARS) {
        const ratio = state.typedChars / state.totalChars;
        if (ratio < AUTHORSHIP_TYPED_RATIO_THRESHOLD) {
          observations.push({
            channel: "RHYTHM",
            type: "typed_ratio_low",
            strength: Math.min(1, 1 - ratio),
            ts: change.ts,
            payload: { sessionTaskId, typedRatio: ratio, totalChars: state.totalChars },
          });
        }
      }
    }

    this.tasks.set(sessionTaskId, state);
    return observations;
  }
}
