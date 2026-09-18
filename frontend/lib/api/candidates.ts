import { apiRequest, apiRequestPage } from "./client";

export type CandidateStatusCode = "UNDER_REVIEW" | "SHORTLISTED" | "INTERVIEWING" | "HIRED" | "REJECTED";

/** UI labels, in the order the stage filter and status picker show them. */
export const CANDIDATE_STATUSES: { code: CandidateStatusCode; label: string }[] = [
  { code: "SHORTLISTED", label: "Shortlisted" },
  { code: "INTERVIEWING", label: "Interviewing" },
  { code: "UNDER_REVIEW", label: "Under Review" },
  { code: "HIRED", label: "Hired" },
  { code: "REJECTED", label: "Rejected" },
];

export function candidateStatusLabel(code: CandidateStatusCode): string {
  return CANDIDATE_STATUSES.find((s) => s.code === code)?.label ?? code;
}

export type DirectoryCandidate = {
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
  status: CandidateStatusCode;
  createdAt: string;
  interviewsTaken: number;
  lastInterviewAt: string | null;
  averageScore: number | null;
};

export type CandidateSessionSummary = {
  id: string;
  status: string;
  title: string | null;
  interviewType: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  durationMinutes: number;
  interviewerName: string | null;
  report: { id: string; composite: number | null; integrity: number | null; reviewRequired: boolean; degraded: boolean } | null;
};

export type CandidateCompetency = { skill: "correctness" | "depth" | "specificity" | "structure" | "handsOn"; score: number; benchmark: number | null };

export type CandidateDetail = DirectoryCandidate & {
  sessions: CandidateSessionSummary[];
  competencies: CandidateCompetency[];
  strengths: string[];
  concerns: string[];
};

export type CandidateSummary = { total: number; byStatus: Record<CandidateStatusCode, number>; roles: string[] };

export type CandidateInput = {
  email: string;
  name?: string;
  phone?: string;
  appliedRole?: string;
  location?: string;
  experienceYears?: number;
  bio?: string;
  skills?: string[];
};

export type CandidatePatch = Partial<{
  name: string;
  phone: string | null;
  appliedRole: string | null;
  location: string | null;
  experienceYears: number | null;
  bio: string | null;
  skills: string[];
  notes: string | null;
  status: CandidateStatusCode;
}>;

export type ListParams = { q?: string; status?: CandidateStatusCode; appliedRole?: string; limit: number; cursor?: string };

export function candidateDisplayName(c: { name: string | null; email: string }): string {
  return c.name?.trim() || c.email;
}

export function candidateAvatarUrl(c: { name: string | null; email: string }): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(candidateDisplayName(c))}`;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function listCandidates(params: ListParams): Promise<{ items: DirectoryCandidate[]; nextCursor: string | null }> {
  const { data, meta } = await apiRequestPage<DirectoryCandidate[], { nextCursor: string | null }>(`/candidates${query(params)}`);
  return { items: data, nextCursor: meta.nextCursor };
}

export function getCandidateSummary(): Promise<CandidateSummary> {
  return apiRequest<CandidateSummary>("/candidates/summary");
}

export function getCandidate(id: string): Promise<CandidateDetail> {
  return apiRequest<CandidateDetail>(`/candidates/${encodeURIComponent(id)}`);
}

export function createCandidate(input: CandidateInput): Promise<DirectoryCandidate> {
  return apiRequest<DirectoryCandidate>("/candidates", { method: "POST", body: input });
}

export function updateCandidate(id: string, patch: CandidatePatch): Promise<DirectoryCandidate> {
  return apiRequest<DirectoryCandidate>(`/candidates/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
}
