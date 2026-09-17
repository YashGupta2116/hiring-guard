import { Router } from "express";
import { isTest } from "../config/env.js";
import { login, logout, me, refresh, register, switchOrg } from "../controllers/auth.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { createRateLimiter } from "../middlewares/rate-limit.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, registerSchema, switchOrgSchema } from "../validators/auth.schema.js";

export const authRouter = Router();

// A high limit in tests avoids the fixed-window memory store tripping across unrelated test cases
// that share the same process; production keeps the Design.md limit of 10/min per IP.
const authLimiter = createRateLimiter({ name: "auth", windowMs: 60_000, limit: isTest ? 1_000 : 10 });

authRouter.use("/auth", authLimiter);

authRouter.post("/auth/register", validate(registerSchema), register);
authRouter.post("/auth/login", validate(loginSchema), login);
authRouter.post("/auth/refresh", refresh);
authRouter.post("/auth/logout", logout);
authRouter.get("/auth/me", requireUser, me);
authRouter.post("/auth/switch-org", requireUser, validate(switchOrgSchema), switchOrg);
