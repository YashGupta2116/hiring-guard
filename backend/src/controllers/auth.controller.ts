import type { Request, Response } from "express";
import { isProduction } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import { AppError } from "../utils/app-error.js";
import { getInput } from "../middlewares/validate.js";
import { created, noContent, ok } from "../utils/respond.js";
import { loginSchema, registerSchema, switchOrgSchema, updateProfileSchema } from "../validators/auth.schema.js";

const REFRESH_COOKIE = "vt_rt";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, registerSchema);
  const result = await authService.register(body);
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
  created(res, { user: result.user, org: result.org, accessToken: result.tokens.accessToken });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, loginSchema);
  const result = await authService.login(body);
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
  ok(res, { user: result.user, activeOrgId: result.activeOrgId, accessToken: result.tokens.accessToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!rawToken) {
    throw new AppError("UNAUTHENTICATED", "Missing refresh token.");
  }
  const tokens = await authService.refresh(rawToken);
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  ok(res, { accessToken: tokens.accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (rawToken) {
    await authService.logout(rawToken);
  }
  clearRefreshCookie(res);
  noContent(res);
}

export async function me(req: Request, res: Response): Promise<void> {
  const result = await authService.getMe(req.user!.sub);
  ok(res, result);
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, updateProfileSchema);
  ok(res, await authService.updateProfile(req.user!.sub, req.user!.orgId, body.name));
}

export async function switchOrg(req: Request, res: Response): Promise<void> {
  const { body } = getInput(req, switchOrgSchema);
  const result = await authService.switchOrg(req.user!.sub, body.orgId);
  ok(res, result);
}
