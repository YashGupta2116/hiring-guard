import { enqueuePipeline } from "../pipeline/flow.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN", "REVIEWER"]);

/** Same access rule as `requireSessionAccess()` (session-access.ts), re-derived here because these
 * two endpoints are keyed by `reportId`, not `sessionId` — there is no `:id` route param to run
 * that middleware against, same reason `flag.service.ts` does its own org/role check inline. */
async function assertReportAccess(orgId: string, userId: string, role: string, sessionId: string): Promise<void> {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Report not found.");
  }
  if (PRIVILEGED_ROLES.has(role)) return;
  const bound = await prisma.sessionInterviewer.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (!bound) {
    throw new AppError("FORBIDDEN", "You are not assigned to this session.");
  }
}

function toReportDto(report: NonNullable<Awaited<ReturnType<typeof prisma.report.findUnique>>>) {
  return {
    id: report.id,
    sessionId: report.sessionId,
    scores: {
      technical: report.technicalScore,
      communication: report.communicationScore,
      integrity: report.integrityScore,
      composite: report.compositeScore,
      reviewRequired: report.reviewRequired,
    },
    degraded: report.degraded,
    lostSteps: report.lostSteps,
    model: report.model,
    methodology: report.methodology,
    htmlAvailable: report.htmlUri !== null,
    pdfAvailable: report.pdfUri !== null,
    emailSentAt: report.emailSentAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

/** `GET /sessions/:id/report` — `requireSessionAccess()` already ran, this just loads the row. */
export async function getReport(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  const report = await prisma.report.findUnique({ where: { sessionId } });
  if (!report) {
    throw new AppError("NOT_FOUND", "Report not ready yet.");
  }
  return toReportDto(report);
}

/** `GET /sessions/:id/pipeline` — Design.md §4.11: "run + step statuses". */
export async function getPipelineStatus(orgId: string, sessionId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  const run = await prisma.pipelineRun.findFirst({
    where: { sessionId },
    orderBy: { startedAt: "desc" },
    include: { steps: true },
  });
  if (!run) {
    throw new AppError("NOT_FOUND", "No pipeline run for this session yet.");
  }
  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    steps: run.steps.map((s) => ({
      step: s.step,
      status: s.status,
      attempts: s.attempts,
      error: s.error,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * `POST /sessions/:id/report/recompute` — Design.md §4.11, "after adjudication post-delivery":
 * a reviewer confirmed/dismissed/downgraded a flag after the report was already delivered, and
 * wants the report to reflect it. Re-runs the whole pipeline rather than just IntegrityRescore +
 * CompositeScore, since a stale transcript pairing or code evaluation could equally be the reason
 * asked for — the pipeline is already idempotent per step (each upserts/replaces its own rows),
 * so a full re-run costs correctness nothing and keeps this to one code path. Returns 202
 * (Design.md): enqueues via the real queue and returns immediately, same as `suggestions/refresh`
 * — the caller finds out it's done via `report.ready` (Design.md §5.2) or by polling `GET .../report`.
 */
export async function recomputeReport(orgId: string, sessionId: string): Promise<{ runId: string }> {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  if (!["PROCESSING", "COMPLETE"].includes(session.status)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Report can only be recomputed once a session has sealed.");
  }
  const runId = await enqueuePipeline(orgId, sessionId);
  return { runId };
}

export async function getReportHtml(orgId: string, userId: string, role: string, reportId: string): Promise<{ html: string }> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report || !report.htmlUri) {
    throw new AppError("NOT_FOUND", "Report not found.");
  }
  await assertReportAccess(orgId, userId, role, report.sessionId);
  const { getStorage } = await import("../providers/index.js");
  const buffer = await getStorage().getBuffer(report.htmlUri);
  return { html: buffer.toString("utf8") };
}

export async function getReportPdf(orgId: string, userId: string, role: string, reportId: string): Promise<{ pdf: Buffer }> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report || !report.pdfUri) {
    throw new AppError("NOT_FOUND", "Report not found or PDF not enabled for this deployment.");
  }
  await assertReportAccess(orgId, userId, role, report.sessionId);
  const { getStorage } = await import("../providers/index.js");
  const pdf = await getStorage().getBuffer(report.pdfUri);
  return { pdf };
}
