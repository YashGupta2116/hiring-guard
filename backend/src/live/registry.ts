import type { SessionRuntime } from "./session-runtime.js";

/** sid -> the one in-memory SessionRuntime actor for that LIVE session. */
const runtimes = new Map<string, SessionRuntime>();

export const registry = {
  get(sessionId: string): SessionRuntime | undefined {
    return runtimes.get(sessionId);
  },
  set(sessionId: string, runtime: SessionRuntime): void {
    runtimes.set(sessionId, runtime);
  },
  delete(sessionId: string): void {
    runtimes.delete(sessionId);
  },
};
