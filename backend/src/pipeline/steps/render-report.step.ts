import { Eta } from "eta";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DETECTOR_VERSION, WEIGHTS_VERSION } from "../../config/detection.js";
import { env } from "../../config/env.js";
import { getStorage } from "../../providers/index.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { PipelineStep } from "../../generated/prisma/enums.js";
import { prisma } from "../../utils/prisma.js";
import type { CompositeScoreOutput } from "./composite-score.step.js";

const COMPOSITE_SCORE: PipelineStep = "COMPOSITE_SCORE";

const templatePath = fileURLToPath(new URL("../../../templates/report.eta", import.meta.url));
const eta = new Eta({ autoEscape: true });
const reportTemplate = readFileSync(templatePath, "utf8");

export type RenderReportOutput = { htmlUri: string; pdfUri: string | null };

function storageKey(orgId: string, sessionId: string, fileName: string): string {
  return `orgs/${orgId}/sessions/${sessionId}/reports/${fileName}`;
}

/**
 * Builds the report's `model` and `methodology` blocks (Design.md §4.11's score block, plus
 * PRD's "every claim links to evidence" — the methodology block is what makes that literal:
 * detector versions, weights version, every unscored window, every superseded flag, the chain
 * head), renders it to HTML via the `eta` template (`templates/report.eta`), optionally to PDF
 * (puppeteer, only when `REPORT_PDF_ENABLED` — Rules.md/Architecture.md §1: "PDF optional, HTML
 * required"), and writes the `reports` row. Does not send email or transition the session —
 * `pipeline/flow.ts`'s root job does that once this succeeds, since delivery is a side effect of
 * a finished report, not part of building one.
 */
export async function computeRenderReport(orgId: string, sessionId: string, runId: string): Promise<RenderReportOutput> {
  const [session, scoreStep, flags, unscoredWindows, manifest, stepRuns, qaPairs, codeEvaluations] = await Promise.all([
    prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId }, include: { candidate: true } }),
    prisma.pipelineStepRun.findUnique({ where: { runId_step: { runId, step: COMPOSITE_SCORE } } }),
    prisma.flag.findMany({ where: { sessionId }, orderBy: { startTs: "asc" } }),
    prisma.unscoredWindow.findMany({ where: { sessionId }, orderBy: { startTs: "asc" } }),
    prisma.evidenceManifest.findUnique({ where: { sessionId } }),
    prisma.pipelineStepRun.findMany({ where: { runId } }),
    prisma.qAPair.findMany({ where: { sessionId }, orderBy: { position: "asc" }, include: { grade: true } }),
    prisma.codeEvaluation.findMany({ where: { sessionTask: { sessionId } } }),
  ]);

  const scores: CompositeScoreOutput = (scoreStep?.output as CompositeScoreOutput | null) ?? {
    technical: null,
    communication: null,
    integrity: null,
    composite: null,
    reviewRequired: true,
    flagCounts: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  };

  const lostSteps = stepRuns.filter((s) => s.status === "FAILED").map((s) => s.step);
  const degraded = lostSteps.length > 0;

  const model = {
    session: { id: session.id, title: session.title, candidateName: session.candidate?.name ?? null },
    scores: {
      technical: scores.technical,
      communication: scores.communication,
      integrity: scores.integrity,
      composite: scores.composite,
      reviewRequired: scores.reviewRequired,
      flagCounts: scores.flagCounts,
    },
    flags: flags.map((f) => ({
      id: f.id,
      type: f.type,
      channel: f.channel,
      severity: f.severity,
      status: f.status,
      origin: f.origin,
      narrative: f.narrative,
      startTs: f.startTs.toISOString(),
      endTs: f.endTs?.toISOString() ?? null,
      mediaOffsetMs: f.mediaOffsetMs,
      scoreDelta: f.scoreDelta,
      supersededByReview: f.supersededByReview,
    })),
    qaPairs: qaPairs.map((p) => ({
      question: p.questionText,
      answer: p.answerText,
      topic: p.topic,
      grade: p.grade
        ? {
            correctness: p.grade.correctness,
            depth: p.grade.depth,
            specificity: p.grade.specificity,
            structure: p.grade.structure,
            handsOn: p.grade.handsOn,
            strengths: p.grade.strengths,
            concerns: p.grade.concerns,
          }
        : null,
    })),
    codeEvaluations: codeEvaluations.map((c) => ({
      hiddenPassed: c.hiddenPassed,
      hiddenTotal: c.hiddenTotal,
      typedRatio: c.typedRatio,
      burstRate: c.burstRate,
    })),
    degraded,
    lostSteps,
  };

  const methodology = {
    detectorVersion: DETECTOR_VERSION,
    weightsVersion: WEIGHTS_VERSION,
    unscoredWindows: unscoredWindows.map((w) => ({
      channel: w.channel,
      reason: w.reason,
      startTs: w.startTs.toISOString(),
      endTs: w.endTs?.toISOString() ?? null,
    })),
    supersededFlags: flags.filter((f) => f.supersededByReview).map((f) => f.id),
    chainHead: manifest?.chainHead ?? null,
    lastSeq: manifest?.lastSeq ?? null,
  };

  const html = eta.renderString(reportTemplate, { model, methodology, generatedAt: new Date().toISOString() });
  const htmlStored = await getStorage().put(storageKey(orgId, sessionId, "report.html"), Buffer.from(html, "utf8"));

  let pdfUri: string | null = null;
  if (env.REPORT_PDF_ENABLED) {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      const pdfStored = await getStorage().put(storageKey(orgId, sessionId, "report.pdf"), Buffer.from(pdfBuffer));
      pdfUri = pdfStored.key;
    } finally {
      await browser.close();
    }
  }

  await prisma.report.upsert({
    where: { sessionId },
    create: {
      sessionId,
      technicalScore: scores.technical,
      communicationScore: scores.communication,
      integrityScore: scores.integrity,
      compositeScore: scores.composite,
      reviewRequired: scores.reviewRequired,
      degraded,
      lostSteps,
      model: model as unknown as Prisma.InputJsonValue,
      methodology: methodology as unknown as Prisma.InputJsonValue,
      htmlUri: htmlStored.key,
      pdfUri,
    },
    update: {
      technicalScore: scores.technical,
      communicationScore: scores.communication,
      integrityScore: scores.integrity,
      compositeScore: scores.composite,
      reviewRequired: scores.reviewRequired,
      degraded,
      lostSteps,
      model: model as unknown as Prisma.InputJsonValue,
      methodology: methodology as unknown as Prisma.InputJsonValue,
      htmlUri: htmlStored.key,
      pdfUri,
    },
  });

  return { htmlUri: htmlStored.key, pdfUri };
}
