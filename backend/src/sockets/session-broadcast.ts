import { emitToCandidate, emitToInterviewers } from "./emitter.js";
import { CANDIDATE_EVENTS, INTERVIEWER_EVENTS } from "./events.js";

function mapCandidateStatus(status: string): "WAITING" | "LIVE" | "ENDED" {
  if (status === "LIVE") return "LIVE";
  if (["ADMITTED", "ARMED", "CONFIGURED", "DRAFT"].includes(status)) return "WAITING";
  return "ENDED";
}

/** Shared by `lifecycle.service.ts` and `seal.service.ts` so neither has to import the other. */
export async function broadcastSessionState(
  sessionId: string,
  status: string,
  startedAt: Date | null,
  endedAt: Date | null,
  endReason: string | null,
): Promise<void> {
  await emitToInterviewers(sessionId, INTERVIEWER_EVENTS.SESSION_STATE, { status, startedAt, endedAt, endReason });
  emitToCandidate(sessionId, CANDIDATE_EVENTS.SESSION_STATE, { status: mapCandidateStatus(status) });
}
