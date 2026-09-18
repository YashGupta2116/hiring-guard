import { ulid } from "ulid";
import { env } from "../config/env.js";
import type { JoinLinkKind } from "../generated/prisma/enums.js";
import { getMail } from "../providers/index.js";
import { AppError } from "../utils/app-error.js";
import { signJoinToken } from "../utils/jwt.js";
import { linkExpiryQueue } from "../utils/queues.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";
import { transition } from "./session-state.service.js";

export type CreateLinkInput = { kind: JoinLinkKind; validFrom?: string; expiresAt: string; sendInvite?: boolean };

export async function createLink(orgId: string, sessionId: string, actorId: string, input: CreateLinkInput) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId }, include: { candidate: true } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }
  // ARMED is allowed so a new link can replace a revoked one, or one revoked because the candidate changed.
  if (session.status !== "CONFIGURED" && session.status !== "ARMED") {
    throw new AppError("INVALID_STATE_TRANSITION", "Session must be CONFIGURED or ARMED to create a join link.", {
      currentStatus: session.status,
    });
  }

  const jti = ulid();
  const expiresAt = new Date(input.expiresAt);
  const token = await signJoinToken({ jti, sid: sessionId, kind: input.kind });

  const joinToken = await prisma.joinToken.create({
    data: {
      jti,
      sessionId,
      kind: input.kind,
      notBefore: input.validFrom ? new Date(input.validFrom) : undefined,
      expiresAt,
      createdById: actorId,
    },
  });

  if (session.status === "CONFIGURED") {
    await transition(sessionId, ["CONFIGURED"], "ARMED", { orgId, actorType: "USER", actorId });
  }

  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  await linkExpiryQueue.add("expire", { sessionId, joinTokenId: joinToken.id }, { delay });

  const url = `${env.APP_URL}/join/${token}`;

  if (input.sendInvite && session.candidate?.email) {
    await getMail().send({
      to: session.candidate.email,
      subject: `Interview invitation: ${session.title ?? "Interview"}`,
      text: `You have been invited to an interview. Join here: ${url}`,
    });
  }

  await log({ orgId, sessionId, actorType: "USER", actorId, action: "link.created", metadata: { linkId: joinToken.id, kind: input.kind } });

  return { linkId: joinToken.id, url, kind: joinToken.kind, expiresAt: joinToken.expiresAt };
}

/**
 * `includeUrl` is for callers who could have created the link themselves (session writers). The join
 * token carries no expiry and is validated against `join_tokens` on every use, so re-signing it for the
 * same jti yields an equivalent, still-revocable URL; read-only reviewers never receive it.
 */
export async function listLinks(orgId: string, sessionId: string, includeUrl = false) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const tokens = await prisma.joinToken.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" } });
  const now = Date.now();
  return Promise.all(
    tokens.map(async (t) => {
      const usable = !t.revokedAt && t.expiresAt.getTime() > now && !(t.kind === "ONE_TIME" && t.usedAt);
      const url =
        includeUrl && usable ? `${env.APP_URL}/join/${await signJoinToken({ jti: t.jti, sid: sessionId, kind: t.kind })}` : null;
      return {
        linkId: t.id,
        url,
        kind: t.kind,
        notBefore: t.notBefore,
        expiresAt: t.expiresAt,
        usedAt: t.usedAt,
        useCount: t.useCount,
        revokedAt: t.revokedAt,
      };
    }),
  );
}

export async function revokeLink(orgId: string, sessionId: string, linkId: string, actorId: string): Promise<void> {
  const joinToken = await prisma.joinToken.findFirst({ where: { id: linkId, sessionId, session: { orgId } } });
  if (!joinToken) {
    throw new AppError("NOT_FOUND", "Link not found.");
  }
  if (!joinToken.revokedAt) {
    await prisma.joinToken.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await log({ orgId, sessionId, actorType: "USER", actorId, action: "link.revoked", metadata: { linkId } });
  }
}
