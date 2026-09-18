import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as reportService from "../services/report.service.js";
import { ok } from "../utils/respond.js";
import { listReportsSchema, reportIdParamSchema } from "../validators/report.schema.js";

export async function listReports(req: Request, res: Response): Promise<void> {
  const { query } = getInput(req, listReportsSchema);
  const { items, nextCursor, total } = await reportService.listReports(req.user!.orgId, req.user!.sub, req.user!.role, query);
  res.status(200).json({ data: items, meta: { nextCursor, limit: query.limit, total } });
}

export async function getReport(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, reportIdParamSchema);
  ok(res, await reportService.getReportById(req.user!.orgId, req.user!.sub, req.user!.role, params.reportId));
}

export async function getReportHtml(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, reportIdParamSchema);
  const { html } = await reportService.getReportHtml(req.user!.orgId, req.user!.sub, req.user!.role, params.reportId);
  res.status(200).type("text/html").send(html);
}

export async function getReportPdf(req: Request, res: Response): Promise<void> {
  const { params } = getInput(req, reportIdParamSchema);
  const { pdf } = await reportService.getReportPdf(req.user!.orgId, req.user!.sub, req.user!.role, params.reportId);
  res.status(200).type("application/pdf").send(pdf);
}
