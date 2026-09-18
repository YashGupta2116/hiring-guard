import type { Job } from "bullmq";
import { getMail } from "../providers/index.js";
import { env } from "../config/env.js";
import type { PipelineStep } from "../generated/prisma/enums.js";
import { publishSessionEvent } from "../utils/events.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { PIPELINE_JOB_OPTS, pipelineFlowProducer, pipelineQueue, type PipelineStepJobData } from "../utils/queues.js";
import { transition } from "../services/session-state.service.js";
import { runStep } from "./step-runner.js";
import { computeSealVerify } from "./steps/seal-verify.step.js";
import { computeTranscriptFinalize } from "./steps/transcript-finalize.step.js";
import { computeIntegrityRescore } from "./steps/integrity-rescore.step.js";
import { computeCodeEvaluate } from "./steps/code-evaluate.step.js";
import { computeMediaIndex } from "./steps/media-index.step.js";
import { computeAnswerGrading } from "./steps/answer-grading.step.js";
import { computeCompositeScore } from "./steps/composite-score.step.js";
import { computeRenderReport } from "./steps/render-report.step.js";

type StepJobData = PipelineStepJobData;

/**
 * Runs one step's work, wrapped for its own `pipeline_step_runs` row. `RENDER_REPORT` additionally
 * delivers (Architecture.md §6.8: "RenderReport -> deliver") once it succeeds, since it is the
 * root of the flow tree — by FlowProducer's own semantics, its job only runs once every other
 * step has finished or exhausted retries, which is exactly "the pipeline is done."
 */
async function executeStep(data: StepJobData): Promise<unknown> {
  const { runId, sessionId, orgId, step } = data;
  switch (step) {
    case "SEAL_VERIFY":
      return runStep(runId, step, () => computeSealVerify(orgId, sessionId));
    case "TRANSCRIPT_FINALIZE":
      return runStep(runId, step, () => computeTranscriptFinalize(sessionId));
    case "INTEGRITY_RESCORE":
      return runStep(runId, step, () => computeIntegrityRescore(sessionId));
    case "CODE_EVALUATE":
      return runStep(runId, step, () => computeCodeEvaluate(sessionId));
    case "MEDIA_INDEX":
      return runStep(runId, step, () => computeMediaIndex(sessionId));
    case "ANSWER_GRADING":
      return runStep(runId, step, () => computeAnswerGrading(sessionId));
    case "COMPOSITE_SCORE":
      return runStep(runId, step, () => computeCompositeScore(sessionId, runId));
    case "RENDER_REPORT": {
      const output = await runStep(runId, step, () => computeRenderReport(orgId, sessionId, runId));
      await deliverReport(runId, sessionId);
      return output;
    }
    default:
      throw new Error(`Unknown pipeline step: ${String(step)}`);
  }
}

/** Email summary only — never transcript text or flag narratives (Rules.md §9, Phases.md §10 test). */
async function sendSummaryEmail(sessionId: string): Promise<void> {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { candidate: true, createdBy: true, report: true },
  });
  if (!session?.createdBy.email || !session.report) return;

  const r = session.report;
  const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  await getMail().send({
    to: session.createdBy.email,
    subject: `Interview report ready: ${session.title ?? session.candidate?.name ?? "Candidate"}`,
    text:
      `The report for this interview is ready.\n\n` +
      `Technical: ${fmt(r.technicalScore)}\nCommunication: ${fmt(r.communicationScore)}\n` +
      `Integrity: ${fmt(r.integrityScore)}\nComposite: ${fmt(r.compositeScore)}\n` +
      `${r.reviewRequired ? "Manual review required.\n" : ""}${r.degraded ? "This report is degraded — some steps did not complete.\n" : ""}\n` +
      `View it at ${env.APP_URL}/app/interviews/${sessionId}/report`,
  });
  await prisma.report.update({ where: { sessionId }, data: { emailSentAt: new Date() } });
}

async function deliverReport(runId: string, sessionId: string): Promise<void> {
  const [session, stepRuns, report] = await Promise.all([
    prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } }),
    prisma.pipelineStepRun.findMany({ where: { runId } }),
    prisma.report.findUnique({ where: { sessionId } }),
  ]);
  const failed = stepRuns.filter((s) => s.status === "FAILED");
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: failed.length > 0 ? "DEGRADED" : "SUCCEEDED", finishedAt: new Date() },
  });

  // Only the run that actually delivers the session (PROCESSING -> COMPLETE) sends the summary
  // email; a later recompute (Design.md: "after adjudication post-delivery") updates the same
  // report row and fires report.ready again, but doesn't re-send mail nobody asked to resend.
  const isFirstDelivery = session.status === "PROCESSING";
  if (isFirstDelivery) {
    await sendSummaryEmail(sessionId);
    await transition(sessionId, ["PROCESSING"], "COMPLETE", { orgId: session.orgId, actorType: "SYSTEM" });
  }
  if (report) {
    await publishSessionEvent(sessionId, "report.ready", { reportId: report.id, degraded: report.degraded });
  }
}

/** BullMQ Worker processor (`worker.ts`) for the `pipeline` queue — every step job, real run. */
export async function processPipelineStep(job: Job<StepJobData>): Promise<unknown> {
  return executeStep(job.data);
}

/**
 * Enqueues the whole post-processing pipeline (Phases.md §10). `SealVerify` has no consumer of
 * its output (every other step re-queries the DB for what it needs, never a BullMQ child value —
 * see step-runner.ts), so it runs as its own independent queued job rather than as an ancestor
 * inside the tree below: the real dependency graph is a DAG (SealVerify fans out to four steps),
 * and `FlowProducer` only models trees (one parent, private children — a job can't be the shared
 * child of two different parents without BullMQ creating it twice). The seven steps that *do* have
 * a real, single-parent dependency chain are the tree:
 *
 *   RenderReport
 *   +-- CompositeScore
 *   |     +-- AnswerGrading
 *   |     |     +-- TranscriptFinalize
 *   |     +-- CodeEvaluate
 *   |     +-- IntegrityRescore
 *   +-- MediaIndex
 *
 * `failParentOnFailure: false` on every node: a step that exhausts its 3 attempts still lets its
 * parent run, which re-queries the DB and gets whatever partial data exists — never blocks the
 * whole run.
 */
export async function enqueuePipeline(orgId: string, sessionId: string): Promise<string> {
  const run = await prisma.pipelineRun.create({ data: { sessionId, status: "RUNNING" } });
  const runId = run.id;

  type FlowNode = {
    name: PipelineStep;
    queueName: string;
    data: StepJobData;
    opts: typeof PIPELINE_JOB_OPTS & { failParentOnFailure: false };
    children: FlowNode[];
  };
  const jobData = (step: PipelineStep): StepJobData => ({ runId, sessionId, orgId, step });
  const node = (step: PipelineStep, children: FlowNode[] = []): FlowNode => ({
    name: step,
    queueName: pipelineQueue.name,
    data: jobData(step),
    opts: { ...PIPELINE_JOB_OPTS, failParentOnFailure: false },
    children,
  });

  await pipelineQueue.add("SEAL_VERIFY", jobData("SEAL_VERIFY"), PIPELINE_JOB_OPTS);

  await pipelineFlowProducer.add(
    node("RENDER_REPORT", [
      node("COMPOSITE_SCORE", [
        node("ANSWER_GRADING", [node("TRANSCRIPT_FINALIZE")]),
        node("CODE_EVALUATE"),
        node("INTEGRITY_RESCORE"),
      ]),
      node("MEDIA_INDEX"),
    ]),
  );

  logger.info({ sessionId, runId }, "pipeline enqueued");
  return runId;
}

/**
 * Runs the whole pipeline synchronously, in dependency order, with no queue involved — the same
 * "call the processor directly" pattern `tests/integration/session.test.ts` already uses for
 * `processJdParse` rather than spinning up a real worker. Production always goes through
 * `enqueuePipeline`; this exists for tests and isn't otherwise reachable.
 */
export async function runPipelineInline(orgId: string, sessionId: string): Promise<string> {
  const run = await prisma.pipelineRun.create({ data: { sessionId, status: "RUNNING" } });
  const runId = run.id;
  const order: PipelineStep[] = [
    "SEAL_VERIFY",
    "TRANSCRIPT_FINALIZE",
    "CODE_EVALUATE",
    "INTEGRITY_RESCORE",
    "ANSWER_GRADING",
    "MEDIA_INDEX",
    "COMPOSITE_SCORE",
    "RENDER_REPORT",
  ];
  for (const step of order) {
    await executeStep({ runId, sessionId, orgId, step }).catch((err: unknown) => {
      logger.warn({ err, sessionId, runId, step }, "pipeline step failed (inline run continues)");
    });
  }
  return runId;
}
