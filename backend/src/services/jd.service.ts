import { JD_ALLOWED_MIME_TYPES } from "../config/constants.js";
import { Prisma } from "../generated/prisma/client.js";
import type { JdSourceType } from "../generated/prisma/enums.js";
import type { ParsedJD } from "../types/parsed-jd.js";
import { AppError } from "../utils/app-error.js";
import { jdParseQueue } from "../utils/queues.js";
import { prisma } from "../utils/prisma.js";
import { getStorage } from "../providers/index.js";
import { log } from "./audit.service.js";

const PDF_MAGIC = Buffer.from("%PDF");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // DOCX is a zip container

function detectSourceType(buffer: Buffer, mimetype: string): JdSourceType {
  if (!JD_ALLOWED_MIME_TYPES.includes(mimetype as (typeof JD_ALLOWED_MIME_TYPES)[number])) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Only PDF, DOCX or plain text files are supported.");
  }

  if (mimetype === "application/pdf") {
    if (!buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "File does not look like a valid PDF.");
    }
    return "PDF";
  }

  if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (!buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "File does not look like a valid DOCX.");
    }
    return "DOCX";
  }

  return "TEXT";
}

async function assertSessionEditable(orgId: string, sessionId: string): Promise<void> {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
}

export type UploadJdInput = {
  file?: { buffer: Buffer; mimetype: string; originalname: string; size: number };
  text?: string;
};

export async function uploadJd(
  orgId: string,
  sessionId: string,
  actorId: string,
  input: UploadJdInput,
): Promise<{ jdId: string; parseStatus: "PENDING" }> {
  await assertSessionEditable(orgId, sessionId);

  if (!input.file && !input.text) {
    throw new AppError("VALIDATION_FAILED", "Provide a file or text.");
  }

  const data = input.file
    ? {
        sourceType: detectSourceType(input.file.buffer, input.file.mimetype),
        fileName: input.file.originalname,
        mimeType: input.file.mimetype,
        sizeBytes: input.file.size,
        rawUri: `orgs/${orgId}/sessions/${sessionId}/jd/original`,
        rawText: null,
      }
    : {
        sourceType: "TEXT" as const,
        fileName: null,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(input.text!),
        rawUri: null,
        rawText: input.text!,
      };

  if (input.file) {
    await getStorage().put(data.rawUri!, input.file.buffer);
  }

  const jd = await prisma.jobDescription.upsert({
    where: { sessionId },
    update: { ...data, parseStatus: "PENDING", parseError: null, parsed: Prisma.JsonNull, edited: false, parsedAt: null },
    create: { sessionId, ...data, parseStatus: "PENDING" },
  });

  await jdParseQueue.add("parse", { sessionId });
  await log({ orgId, sessionId, actorType: "USER", actorId, action: "jd.uploaded", metadata: { sourceType: jd.sourceType } });

  return { jdId: jd.id, parseStatus: "PENDING" };
}

export async function getJd(orgId: string, sessionId: string) {
  await assertSessionEditable(orgId, sessionId);
  const jd = await prisma.jobDescription.findUnique({ where: { sessionId } });
  if (!jd) {
    throw new AppError("NOT_FOUND", "No job description uploaded for this session.");
  }
  return {
    sourceType: jd.sourceType,
    fileName: jd.fileName,
    parseStatus: jd.parseStatus,
    parseError: jd.parseError,
    parsed: jd.parsed,
    edited: jd.edited,
    parsedAt: jd.parsedAt,
  };
}

export async function patchJd(orgId: string, sessionId: string, parsed: ParsedJD) {
  await assertSessionEditable(orgId, sessionId);
  const jd = await prisma.jobDescription.findUnique({ where: { sessionId } });
  if (!jd) {
    throw new AppError("NOT_FOUND", "No job description uploaded for this session.");
  }

  await prisma.jobDescription.update({ where: { sessionId }, data: { parsed, edited: true } });
  return getJd(orgId, sessionId);
}

export async function reparseJd(orgId: string, sessionId: string, actorId: string): Promise<{ parseStatus: "PENDING" }> {
  await assertSessionEditable(orgId, sessionId);
  const jd = await prisma.jobDescription.findUnique({ where: { sessionId } });
  if (!jd) {
    throw new AppError("NOT_FOUND", "No job description uploaded for this session.");
  }

  await prisma.jobDescription.update({ where: { sessionId }, data: { parseStatus: "PENDING", parseError: null } });
  await jdParseQueue.add("parse", { sessionId });
  await log({ orgId, sessionId, actorType: "USER", actorId, action: "jd.reparse_requested" });

  return { parseStatus: "PENDING" };
}
