import type { ErrorRequestHandler, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError, ERROR_STATUS, type ErrorCode } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";

type ErrorBody = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

function send(res: Response, requestId: string | undefined, body: ErrorBody): void {
  res.status(ERROR_STATUS[body.code]).json({ error: { ...body, requestId: requestId ?? null } });
}

function hasStringProp<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<K, unknown>)[key] === "string";
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = req.requestId;

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, requestId }, err.message);
    send(res, requestId, { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }

  if (err instanceof ZodError) {
    send(res, requestId, {
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
      details: { fields: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      send(res, requestId, { code: "CONFLICT", message: "A record with these values already exists." });
      return;
    }
    if (err.code === "P2025") {
      send(res, requestId, { code: "NOT_FOUND", message: "Record not found." });
      return;
    }
  }

  // body-parser (express.json) errors
  if (hasStringProp(err, "type")) {
    if (err.type === "entity.parse.failed") {
      send(res, requestId, { code: "VALIDATION_FAILED", message: "Malformed JSON body." });
      return;
    }
    if (err.type === "entity.too.large") {
      send(res, requestId, { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
      return;
    }
  }

  // multer file size limit (Phase 2)
  if (hasStringProp(err, "code") && err.code === "LIMIT_FILE_SIZE") {
    send(res, requestId, { code: "PAYLOAD_TOO_LARGE", message: "File exceeds the size limit." });
    return;
  }

  logger.error({ err, requestId }, "unhandled error");
  send(res, requestId, { code: "INTERNAL", message: "Something went wrong." });
};
