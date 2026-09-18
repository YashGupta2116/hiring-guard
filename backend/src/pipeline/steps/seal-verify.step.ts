import { verifySession, type EvidenceVerification } from "../../services/evidence.service.js";

/**
 * Confirms the hash chain and manifest signature the seal sequence produced (Phase 9) are still
 * intact before anything downstream treats this session's evidence as trustworthy. Read-only —
 * re-runs the exact check `GET /sessions/:id/evidence/verify` uses.
 *
 * Throwing on `!valid` puts this step's own `pipeline_step_runs` row into FAILED (via `runStep`)
 * so `lostSteps`/`degraded` on the report are honest about it, but — per Phases.md's degraded
 * path — every other step still runs regardless: none of them read this step's *output*, they
 * each independently query the DB for what they need, so a broken chain doesn't block a partial
 * report, it just gets reported as broken.
 */
export async function computeSealVerify(orgId: string, sessionId: string): Promise<EvidenceVerification> {
  const result = await verifySession(orgId, sessionId);
  if (!result.valid) {
    throw new Error(`Evidence chain invalid at seq ${result.firstBrokenSeq ?? "?"} (signatureValid=${result.signatureValid})`);
  }
  return result;
}
