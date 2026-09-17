import type { SessionStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

export type CandidateListItem = { id: string; email: string; name: string | null; createdAt: Date };

export async function listCandidates(
  orgId: string,
  opts: { q?: string; limit: number; cursor?: string },
): Promise<{ items: CandidateListItem[]; nextCursor: string | null }> {
  const candidates = await prisma.candidate.findMany({
    where: {
      orgId,
      ...(opts.q ? { OR: [{ email: { contains: opts.q, mode: "insensitive" } }, { name: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { id: "asc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = candidates.length > opts.limit;
  const items = hasMore ? candidates.slice(0, opts.limit) : candidates;

  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function createCandidate(orgId: string, email: string, name?: string): Promise<CandidateListItem> {
  return prisma.candidate.upsert({
    where: { orgId_email: { orgId, email } },
    update: { ...(name ? { name } : {}) },
    create: { orgId, email, name },
  });
}

export async function getCandidate(
  orgId: string,
  id: string,
): Promise<CandidateListItem & { sessions: { id: string; status: SessionStatus; createdAt: Date }[] }> {
  const candidate = await prisma.candidate.findFirst({
    where: { id, orgId },
    include: { sessions: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!candidate) {
    throw new AppError("NOT_FOUND", "Candidate not found.");
  }
  return candidate;
}
