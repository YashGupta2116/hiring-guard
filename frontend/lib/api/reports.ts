import { apiRequest, apiRequestBlob, apiRequestPage } from "./client";

export type FlagSeverity = "LOW" | "MEDIUM" | "HIGH";
export type FlagStatus = "OPEN" | "CONFIRMED" | "DISMISSED" | "DOWNGRADED" | "SUPERSEDED";

export type ReportScores = {
  technical: number | null;
  communication: number | null;
  integrity: number | null;
  composite: number | null;
  /** True whenever no composite could be produced, not only for a low integrity score. */
  reviewRequired: boolean;
};

export type ReportSessionSummary = {
  id: string;
  title: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  candidate: { id: string; name: string | null; email: string } | null;
  interviewerName: string | null;
};

export type ReportListItem = {
  id: string;
  sessionId: string;
  createdAt: string;
  scores: ReportScores;
  degraded: boolean;
  session: ReportSessionSummary;
};

export type ReportFlag = {
  id: string;
  type: string;
  channel: string;
  severity: FlagSeverity;
  status: FlagStatus;
  origin: string;
  narrative: string;
  startTs: string;
  endTs: string | null;
  mediaOffsetMs: number | null;
  /** Integrity points the flag cost (positive = points lost). */
  scoreDelta: number;
  supersededByReview: boolean;
};

export type AnswerGrade = {
  correctness: number;
  depth: number;
  specificity: number;
  structure: number;
  handsOn: number;
  strengths: string[];
  concerns: string[];
};

export type ReportQa = { question: string; answer: string; topic: string | null; grade: AnswerGrade | null };
export type ReportCodeEvaluation = { hiddenPassed: number; hiddenTotal: number; typedRatio: number | null; burstRate: number | null };

export type ReportMethodology = {
  detectorVersion: string;
  weightsVersion: string;
  unscoredWindows: { channel: string; reason: string; startTs: string; endTs: string | null }[];
  supersededFlags: string[];
  chainHead: string | null;
  lastSeq: number | null;
};

export type ReportDetail = {
  id: string;
  sessionId: string;
  scores: ReportScores;
  degraded: boolean;
  lostSteps: string[];
  model: {
    scores: { flagCounts: { LOW: number; MEDIUM: number; HIGH: number } };
    flags: ReportFlag[];
    qaPairs: ReportQa[];
    codeEvaluations: ReportCodeEvaluation[];
  };
  methodology: ReportMethodology;
  htmlAvailable: boolean;
  pdfAvailable: boolean;
  emailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: ReportSessionSummary;
};

export type PipelineStepName =
  | "SEAL_VERIFY"
  | "TRANSCRIPT_FINALIZE"
  | "INTEGRITY_RESCORE"
  | "CODE_EVALUATE"
  | "MEDIA_INDEX"
  | "ANSWER_GRADING"
  | "COMPOSITE_SCORE"
  | "RENDER_REPORT";

export type PipelineStatus = {
  runId: string;
  status: "RUNNING" | "SUCCEEDED" | "DEGRADED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  steps: {
    step: PipelineStepName;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
    attempts: number;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
};

export type EvidenceVerification = {
  valid: boolean;
  chainValid: boolean;
  signatureValid: boolean;
  lastSeq: number;
  chainHead: string | null;
  firstBrokenSeq: number | null;
  verifiedAt: string;
};

// ---- Presentation rules ----------------------------------------------------------------------

export type IntegrityBand = "High Confidence" | "Moderate Variance" | "Review Recommended";

/** Same cut-offs the backend's composite formula uses: 85 for full marks, 70 for "review required". */
export function integrityBand(score: number | null): IntegrityBand | null {
  if (score === null) return null;
  if (score >= 85) return "High Confidence";
  if (score >= 70) return "Moderate Variance";
  return "Review Recommended";
}

export type ReportStatusLabel = "Ready" | "Review Required" | "Partial";

export function reportStatus(scores: ReportScores, degraded: boolean): ReportStatusLabel {
  if (degraded) return "Partial";
  return scores.reviewRequired ? "Review Required" : "Ready";
}

/** Why there is no overall score, in plain words (the backend only says "review required"). */
export function compositeReasons(scores: ReportScores): string[] {
  if (scores.composite !== null) return [];
  const reasons: string[] = [];
  if (scores.integrity === null) reasons.push("the integrity rescore did not complete");
  else if (scores.integrity < 70) reasons.push(`the integrity score is ${Math.round(scores.integrity)}, below the 70 needed for a composite`);
  if (scores.technical === null) reasons.push("nothing technical could be scored (no hidden-test results or graded answers)");
  if (scores.communication === null) reasons.push("no answers were graded, which needs a transcript");
  return reasons;
}

export const FLAG_STATUS_LABEL: Record<FlagStatus, string> = {
  OPEN: "Open",
  CONFIRMED: "Confirmed",
  DISMISSED: "Dismissed",
  DOWNGRADED: "Downgraded",
  SUPERSEDED: "Superseded by review",
};

// ---- API calls -------------------------------------------------------------------------------

export type ReportListParams = { q?: string; band?: "HIGH" | "MODERATE" | "REVIEW"; limit: number; cursor?: string };

export async function listReports(params: ReportListParams): Promise<{ items: ReportListItem[]; nextCursor: string | null; total: number }> {
  const search = new URLSearchParams({ limit: String(params.limit) });
  if (params.q) search.set("q", params.q);
  if (params.band) search.set("band", params.band);
  if (params.cursor) search.set("cursor", params.cursor);
  const { data, meta } = await apiRequestPage<ReportListItem[], { nextCursor: string | null; total: number }>(`/reports?${search.toString()}`);
  return { items: data, nextCursor: meta.nextCursor, total: meta.total };
}

export const getReport = (id: string) => apiRequest<ReportDetail>(`/reports/${encodeURIComponent(id)}`);
export const getPipelineStatus = (sessionId: string) => apiRequest<PipelineStatus>(`/sessions/${encodeURIComponent(sessionId)}/pipeline`);
export const verifyEvidence = (sessionId: string) => apiRequest<EvidenceVerification>(`/sessions/${encodeURIComponent(sessionId)}/evidence/verify`);
export const recomputeReport = (sessionId: string) => apiRequest<{ runId: string }>(`/sessions/${encodeURIComponent(sessionId)}/report/recompute`, { method: "POST" });

/** The rendered report needs the bearer token, so it is fetched and shown through a blob URL rather than linked. */
export const fetchReportHtml = (id: string) => apiRequestBlob(`/reports/${encodeURIComponent(id)}/html`);
export const fetchReportPdf = (id: string) => apiRequestBlob(`/reports/${encodeURIComponent(id)}/pdf`);
