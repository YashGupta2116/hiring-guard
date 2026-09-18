import { registry } from "../live/registry.js";
import { toFlagFrame } from "../live/fusion/flag-builder.js";
import type { AdjudicationAction, FlagSeverity, FlagStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export async function listFlags(orgId: string, sessionId: string, filters: { status?: FlagStatus; severity?: FlagSeverity }) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, orgId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found.");
  }

  const flags = await prisma.flag.findMany({
    where: { sessionId, ...(filters.status && { status: filters.status }), ...(filters.severity && { severity: filters.severity }) },
    include: { warnings: { orderBy: { shownAt: "desc" }, take: 1 }, adjudications: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  return flags.map((flag) => ({
    ...toFlagFrame(flag),
    warning: flag.warnings[0]
      ? { tier: flag.warnings[0].tier, shownAt: flag.warnings[0].shownAt.toISOString(), acknowledgedAt: flag.warnings[0].acknowledgedAt?.toISOString() ?? null, ackLatencyMs: flag.warnings[0].ackLatencyMs }
      : null,
    adjudications: flag.adjudications.map((a) => ({
      id: a.id,
      action: a.action,
      fromSeverity: a.fromSeverity,
      toSeverity: a.toSeverity,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    })),
  }));
}

const NEW_STATUS: Record<AdjudicationAction, FlagStatus> = {
  CONFIRM: "CONFIRMED",
  DISMISS: "DISMISSED",
  DOWNGRADE: "DOWNGRADED",
};

const PRIVILEGED_ADJUDICATE_ROLES = new Set(["OWNER", "ADMIN", "REVIEWER"]);

export async function adjudicateFlag(
  orgId: string,
  flagId: string,
  actorId: string,
  role: string,
  input: { action: AdjudicationAction; toSeverity?: FlagSeverity; reason: string },
) {
  const flag = await prisma.flag.findUnique({ where: { id: flagId }, include: { session: true } });
  if (!flag || flag.session.orgId !== orgId) {
    throw new AppError("NOT_FOUND", "Flag not found.");
  }

  if (!PRIVILEGED_ADJUDICATE_ROLES.has(role)) {
    const bound = await prisma.sessionInterviewer.findUnique({ where: { sessionId_userId: { sessionId: flag.sessionId, userId: actorId } } });
    if (!bound) {
      throw new AppError("FORBIDDEN", "You are not assigned to this session.");
    }
  }

  const toSeverity = input.action === "DOWNGRADE" ? (input.toSeverity ?? null) : null;
  const newStatus = NEW_STATUS[input.action];

  const updated = await prisma.$transaction(async (tx) => {
    await tx.flagAdjudication.create({
      data: { flagId, reviewerId: actorId, action: input.action, fromSeverity: flag.severity, toSeverity, reason: input.reason },
    });
    return tx.flag.update({
      where: { id: flagId },
      data: { status: newStatus, ...(toSeverity && { severity: toSeverity }) },
    });
  });

  // Best-effort live nudge only; Phase 10's IntegrityRescore is the authoritative recompute.
  const runtime = registry.get(flag.sessionId);
  if (runtime && (input.action === "DISMISS" || input.action === "DOWNGRADE")) {
    const linkedObservations = await prisma.flagObservation.findMany({ where: { flagId }, include: { observation: true } });
    const totalLlr = linkedObservations.reduce((sum, link) => sum + (link.observation.llr ?? 0), 0);
    const fraction = input.action === "DISMISS" ? 1 : 0.5;
    runtime.applyAdjudication(flag.channel, -totalLlr * fraction);
  }

  return updated;
}
