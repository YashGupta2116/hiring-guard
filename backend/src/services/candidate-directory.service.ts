import type { Prisma } from "../generated/prisma/client.js";
import type { CandidateStatus, SessionStatus } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";

const GRADE_DIMENSIONS = ["correctness", "depth", "specificity", "structure", "handsOn"] as const;
type GradeDimension = (typeof GRADE_DIMENSIONS)[number];

export type CandidateProfile = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  appliedRole: string | null;
  location: string | null;
  experienceYears: number | null;
  bio: string | null;
  skills: string[];
  notes: string | null;
  status: CandidateStatus;
  createdAt: Date;
};

export type CandidateListItem = CandidateProfile & {
  /** Sessions the candidate actually sat (started), not merely scheduled ones. */
  interviewsTaken: number;
  lastInterviewAt: Date | null;
  /** Mean composite score across delivered reports; null when there is none (or integrity review is pending). */
  averageScore: number | null;
};

export type CreateCandidateInput = {
  email: string;
  name?: string;
  phone?: string;
  appliedRole?: string;
  location?: string;
  experienceYears?: number;
  bio?: string;
  skills?: string[];
  notes?: string;
  status?: CandidateStatus;
};

export type UpdateCandidateInput = Partial<{
  name: string;
  phone: string | null;
  appliedRole: string | null;
  location: string | null;
  experienceYears: number | null;
  bio: string | null;
  skills: string[];
  notes: string | null;
  status: CandidateStatus;
}>;

function toProfile(c: CandidateProfile): CandidateProfile {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    appliedRole: c.appliedRole,
    location: c.location,
    experienceYears: c.experienceYears,
    bio: c.bio,
    skills: c.skills,
    notes: c.notes,
    status: c.status,
    createdAt: c.createdAt,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

async function attachStats(orgId: string, candidates: CandidateProfile[]): Promise<CandidateListItem[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);

  const [taken, scored] = await Promise.all([
    prisma.interviewSession.groupBy({
      by: ["candidateId"],
      where: { orgId, candidateId: { in: ids }, startedAt: { not: null } },
      _count: { _all: true },
      _max: { startedAt: true },
    }),
    prisma.report.findMany({
      where: { compositeScore: { not: null }, session: { orgId, candidateId: { in: ids } } },
      select: { compositeScore: true, session: { select: { candidateId: true } } },
    }),
  ]);

  const takenById = new Map(taken.map((t) => [t.candidateId, t]));
  const scoresById = new Map<string, number[]>();
  for (const r of scored) {
    const cid = r.session.candidateId;
    if (cid === null || r.compositeScore === null) continue;
    scoresById.set(cid, [...(scoresById.get(cid) ?? []), r.compositeScore]);
  }

  return candidates.map((c) => {
    const t = takenById.get(c.id);
    const scores = scoresById.get(c.id) ?? [];
    return {
      ...toProfile(c),
      interviewsTaken: t?._count._all ?? 0,
      lastInterviewAt: t?._max.startedAt ?? null,
      averageScore: scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  });
}

/** Case-insensitive substring match against the skills array, which Prisma's `has` can't do (exact, case-sensitive). */
async function candidateIdsWithSkillLike(orgId: string, q: string): Promise<string[]> {
  // Escape LIKE wildcards so a search for "100%" or "a_b" matches literally.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM candidates c
    WHERE c."orgId" = ${orgId} AND EXISTS (SELECT 1 FROM unnest(c.skills) AS skill WHERE skill ILIKE ${pattern})`;
  return rows.map((r) => r.id);
}

export async function listCandidates(
  orgId: string,
  opts: { q?: string; status?: CandidateStatus; appliedRole?: string; limit: number; cursor?: string },
): Promise<{ items: CandidateListItem[]; nextCursor: string | null }> {
  const skillMatches = opts.q ? await candidateIdsWithSkillLike(orgId, opts.q) : [];
  const where: Prisma.CandidateWhereInput = {
    orgId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.appliedRole ? { appliedRole: opts.appliedRole } : {}),
    ...(opts.q
      ? {
          OR: [
            { email: { contains: opts.q, mode: "insensitive" } },
            { name: { contains: opts.q, mode: "insensitive" } },
            { appliedRole: { contains: opts.q, mode: "insensitive" } },
            { id: { in: skillMatches } },
          ],
        }
      : {}),
  };

  const rows = await prisma.candidate.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;

  return { items: await attachStats(orgId, page), nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** Whole-directory counts for the stat cards and the role filter (a page of rows can't provide these). */
export async function getCandidateSummary(orgId: string): Promise<{
  total: number;
  byStatus: Record<CandidateStatus, number>;
  roles: string[];
}> {
  const [grouped, roles] = await Promise.all([
    prisma.candidate.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.candidate.findMany({
      where: { orgId, appliedRole: { not: null } },
      distinct: ["appliedRole"],
      select: { appliedRole: true },
      orderBy: { appliedRole: "asc" },
    }),
  ]);

  const byStatus: Record<CandidateStatus, number> = { UNDER_REVIEW: 0, SHORTLISTED: 0, INTERVIEWING: 0, HIRED: 0, REJECTED: 0 };
  for (const g of grouped) byStatus[g.status] = g._count._all;

  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    roles: roles.map((r) => r.appliedRole).filter((r): r is string => r !== null),
  };
}

export async function createCandidate(orgId: string, userId: string, input: CreateCandidateInput): Promise<CandidateListItem> {
  const { email, ...profile } = input;
  const candidate = await prisma.candidate.upsert({
    where: { orgId_email: { orgId, email } },
    update: profile,
    create: { orgId, email, ...profile },
  });
  await log({ orgId, actorType: "USER", actorId: userId, action: "candidate.saved", metadata: { candidateId: candidate.id } });
  return (await attachStats(orgId, [candidate]))[0]!;
}

async function findCandidateOrThrow(orgId: string, id: string) {
  const candidate = await prisma.candidate.findFirst({ where: { id, orgId } });
  if (!candidate) {
    throw new AppError("NOT_FOUND", "Candidate not found.");
  }
  return candidate;
}

export async function updateCandidate(orgId: string, userId: string, id: string, input: UpdateCandidateInput): Promise<CandidateListItem> {
  await findCandidateOrThrow(orgId, id);
  const updated = await prisma.candidate.update({ where: { id }, data: input });
  await log({
    orgId,
    actorType: "USER",
    actorId: userId,
    action: "candidate.updated",
    metadata: { candidateId: id, fields: Object.keys(input) },
  });
  return (await attachStats(orgId, [updated]))[0]!;
}

export type CandidateSessionSummary = {
  id: string;
  status: SessionStatus;
  title: string | null;
  interviewType: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  durationMinutes: number;
  interviewerName: string | null;
  report: { id: string; composite: number | null; integrity: number | null; reviewRequired: boolean; degraded: boolean } | null;
};

export type CandidateCompetency = { skill: GradeDimension; score: number; benchmark: number | null };

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function topByFrequency(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text]) => text);
}

export async function getCandidate(orgId: string, id: string) {
  const candidate = await findCandidateOrThrow(orgId, id);
  const [item] = await attachStats(orgId, [candidate]);

  const sessions = await prisma.interviewSession.findMany({
    where: { orgId, candidateId: id },
    orderBy: { createdAt: "desc" },
    include: {
      interviewers: { where: { isPrimary: true }, include: { user: { select: { name: true } } } },
      report: { select: { id: true, compositeScore: true, integrityScore: true, reviewRequired: true, degraded: true } },
    },
  });

  const [grades, orgAverage] = await Promise.all([
    prisma.answerGrade.findMany({ where: { qaPair: { session: { orgId, candidateId: id } } } }),
    prisma.answerGrade.aggregate({
      where: { qaPair: { session: { orgId } } },
      _avg: { correctness: true, depth: true, specificity: true, structure: true, handsOn: true },
    }),
  ]);

  const competencies: CandidateCompetency[] =
    grades.length === 0
      ? []
      : GRADE_DIMENSIONS.map((dim) => {
          const orgMean = orgAverage._avg[dim];
          return {
            skill: dim,
            score: round1(grades.reduce((sum, g) => sum + g[dim], 0) / grades.length),
            benchmark: orgMean === null ? null : round1(orgMean),
          };
        });

  const sessionSummaries: CandidateSessionSummary[] = sessions.map((s) => ({
    id: s.id,
    status: s.status,
    title: s.title,
    interviewType: s.interviewType,
    scheduledAt: s.scheduledAt,
    startedAt: s.startedAt,
    durationMinutes: s.durationMinutes,
    interviewerName: s.interviewers[0]?.user.name ?? null,
    report: s.report
      ? {
          id: s.report.id,
          composite: s.report.compositeScore,
          integrity: s.report.integrityScore,
          reviewRequired: s.report.reviewRequired,
          degraded: s.report.degraded,
        }
      : null,
  }));

  return {
    ...item!,
    sessions: sessionSummaries,
    competencies,
    strengths: topByFrequency(
      grades.flatMap((g) => asStrings(g.strengths)),
      6,
    ),
    concerns: topByFrequency(
      grades.flatMap((g) => asStrings(g.concerns)),
      6,
    ),
  };
}
