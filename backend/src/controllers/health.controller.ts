import type { Request, Response } from "express";
import { checkReadiness } from "../services/health.service.js";
import { AppError } from "../utils/app-error.js";
import { ok } from "../utils/respond.js";

export function health(_req: Request, res: Response): void {
  ok(res, { status: "ok", uptimeSeconds: Math.round(process.uptime()) });
}

export async function ready(_req: Request, res: Response): Promise<void> {
  const report = await checkReadiness();
  if (!report.ready) {
    throw new AppError("DEPENDENCY_UNAVAILABLE", "One or more dependencies are unavailable.", {
      db: report.db,
      redis: report.redis,
    });
  }
  ok(res, { db: report.db, redis: report.redis });
}
