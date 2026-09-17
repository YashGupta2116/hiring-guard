import type { RequestHandler } from "express";
import { newRequestId } from "../utils/ids.js";

const HEADER = "x-request-id";
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuses a safe incoming X-Request-Id or creates one, and echoes it on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers[HEADER];
  const id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : newRequestId();
  req.requestId = id;
  req.headers[HEADER] = id;
  res.setHeader("X-Request-Id", id);
  next();
};
