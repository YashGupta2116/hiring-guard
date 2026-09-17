import { Router } from "express";
import { healthRouter } from "./health.routes.js";

/** Everything mounted here lives under /api/v1. */
export const apiRouter = Router();

apiRouter.use(healthRouter);
// Phase 1: apiRouter.use("/auth", authRouter);
