import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { candidateDirectoryRouter } from "./candidate-directory.routes.js";
import { codingTaskRouter } from "./coding-task.routes.js";
import { healthRouter } from "./health.routes.js";
import { jdRouter } from "./jd.routes.js";
import { orgRouter } from "./org.routes.js";
import { questionBankRouter } from "./question-bank.routes.js";
import { sessionRouter } from "./session.routes.js";

/** Everything mounted here lives under /api/v1. */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(orgRouter);
apiRouter.use(candidateDirectoryRouter);
apiRouter.use(sessionRouter);
apiRouter.use(jdRouter);
apiRouter.use(codingTaskRouter);
apiRouter.use(questionBankRouter);
