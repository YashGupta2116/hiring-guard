import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";

export const notFound: RequestHandler = (req) => {
  throw new AppError("NOT_FOUND", `Route ${req.method} ${req.path} not found.`);
};
