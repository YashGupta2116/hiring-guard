import type { Job } from "bullmq";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { getLlm, getStorage } from "../providers/index.js";
import { parsedJdSchema } from "../types/parsed-jd.js";
import { publishSessionEvent } from "../utils/events.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import type { JdParseJobData } from "../utils/queues.js";
import type { JobDescription } from "../generated/prisma/client.js";

async function extractText(jd: JobDescription): Promise<string> {
  if (jd.sourceType === "TEXT") {
    return jd.rawText ?? "";
  }

  const buffer = await getStorage().getBuffer(jd.rawUri!);

  if (jd.sourceType === "PDF") {
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }

  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** BullMQ processor for the `jd-parse` queue. Never throws: failures are recorded as parseStatus FAILED. */
export async function processJdParse(job: Job<JdParseJobData>): Promise<void> {
  const { sessionId } = job.data;

  const jd = await prisma.jobDescription.findUnique({ where: { sessionId } });
  if (!jd) {
    logger.warn({ sessionId }, "jd-parse job for session with no job description");
    return;
  }

  await prisma.jobDescription.update({ where: { sessionId }, data: { parseStatus: "PROCESSING" } });

  try {
    const text = await extractText(jd);
    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    const parsed = parsedJdSchema.parse(await getLlm().parseJd(text, session.durationMinutes));

    await prisma.jobDescription.update({
      where: { sessionId },
      data: { parseStatus: "PARSED", parsed, parsedAt: new Date(), parseError: null },
    });
    await publishSessionEvent(sessionId, "jd.parsed", { jdId: jd.id, parseStatus: "PARSED" });
  } catch (err) {
    logger.error({ err, sessionId }, "jd parse failed");
    await prisma.jobDescription.update({
      where: { sessionId },
      data: { parseStatus: "FAILED", parseError: err instanceof Error ? err.message : "Unknown error" },
    });
    await publishSessionEvent(sessionId, "jd.parsed", { jdId: jd.id, parseStatus: "FAILED" });
  }
}
