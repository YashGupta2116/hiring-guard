import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { candidateDirectoryRouter } from "./candidate-directory.routes.js";
import { healthRouter } from "./health.routes.js";
import { orgRouter } from "./org.routes.js";

/** Everything mounted here lives under /api/v1. */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(orgRouter);
apiRouter.use(candidateDirectoryRouter);
