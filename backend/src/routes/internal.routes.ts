import { Router } from "express";
import { postHeartbeat, postObservations, postTranscript } from "../controllers/internal.controller.js";
import { requireServiceToken } from "../middlewares/service-token.js";
import { validate } from "../middlewares/validate.js";
import { heartbeatSchema, observationsSchema, transcriptSchema } from "../validators/internal.schema.js";

export const internalRouter = Router();

internalRouter.use("/internal", requireServiceToken);

internalRouter.post("/internal/sessions/:id/observations", validate(observationsSchema), postObservations);
internalRouter.post("/internal/sessions/:id/transcript", validate(transcriptSchema), postTranscript);
internalRouter.post("/internal/sessions/:id/heartbeat", validate(heartbeatSchema), postHeartbeat);
