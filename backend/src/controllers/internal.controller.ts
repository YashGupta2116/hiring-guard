import type { Request, Response } from "express";
import { getInput } from "../middlewares/validate.js";
import * as internalService from "../services/internal.service.js";
import { accepted } from "../utils/respond.js";
import { heartbeatSchema, observationsSchema, transcriptSchema } from "../validators/internal.schema.js";

export async function postObservations(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, observationsSchema);
  await internalService.ingestExternalObservations(params.id, body.producer, body.items);
  accepted(res, { accepted: body.items.length });
}

export async function postTranscript(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, transcriptSchema);
  await internalService.ingestTranscript(params.id, body.segments);
  accepted(res, { accepted: body.segments.length });
}

export async function postHeartbeat(req: Request, res: Response): Promise<void> {
  const { params, body } = getInput(req, heartbeatSchema);
  await internalService.ingestHeartbeat(params.id, body.producer, body.channels, body.status);
  accepted(res, { ok: true });
}
