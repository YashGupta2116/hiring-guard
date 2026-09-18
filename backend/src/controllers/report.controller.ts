import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as reportService from "../services/report.service.js";
import { reportIdParamSchema } from "../validators/report.schema.js";

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
