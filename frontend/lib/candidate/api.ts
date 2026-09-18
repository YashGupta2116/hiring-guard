import { apiRequest } from "@/lib/api/client";

// ---- Join flow (public: the join token in the path is the credential) ---------------------------

export type JoinSummary = {
  sessionTitle: string | null;
  orgName: string;
  interviewerNames: string[];
  scheduledAt: string | null;
  durationMinutes: number;
  status: "READY" | "NOT_YET_OPEN";
};

export type PreflightProbe = {
  webrtc: boolean;
  getDisplayMedia: boolean;
  camera: "granted" | "prompt" | "denied" | "unavailable";
  microphone: "granted" | "prompt" | "denied" | "unavailable";
  screenCount: number;
  isExtended: boolean;
  downlinkMbps: number;
  hardwareConcurrency: number;
  userAgent: string;
};

export type PreflightIssue = { code: string; message: string };
export type PreflightResult = { preflightId: string; passed: boolean; failures: PreflightIssue[]; warnings: PreflightIssue[] };

export type Policy = {
  bullets: string[];
  recording: { video: boolean; audio: boolean; screen: boolean };
  retentionDays: number;
  viewers: string;
  policyHash: string;
};

export type ConsentResult = { candidateToken: string; media: { url: string; token: string } } | { ended: true };

const join = (token: string) => `/join/${encodeURIComponent(token)}`;

export function getJoinSummary(token: string): Promise<JoinSummary> {
  return apiRequest<JoinSummary>(join(token), { auth: false });
}

export function runPreflight(token: string, probe: PreflightProbe): Promise<PreflightResult> {
  return apiRequest<PreflightResult>(`${join(token)}/preflight`, { method: "POST", body: probe, auth: false });
}

export function getPolicy(token: string): Promise<Policy> {
  return apiRequest<Policy>(`${join(token)}/policy`, { auth: false });
}

export function submitConsent(
  token: string,
  input: { preflightId: string; policyHash: string; accepted: boolean },
): Promise<ConsentResult> {
  return apiRequest<ConsentResult>(`${join(token)}/consent`, {
    method: "POST",
    body: { ...input, scrolledToEnd: true },
    auth: false,
  });
}

// ---- Candidate endpoints (candidate token) -------------------------------------------------------

export type CandidateSessionInfo = {
  status: string;
  title: string | null;
  startedAt: string | null;
  durationMinutes: number;
  hasCodingRound: boolean;
};

export type CandidateTask = {
  taskId: string;
  title: string;
  statement: string;
  languages: string[];
  starterCode: Record<string, string> | null;
  visibleTests: { input: string; expectedOutput: string }[];
  frozen: boolean;
};

export type TestResult = { index: number; passed: boolean; actualOutput: string; expectedOutput: string };

export type RunResult = {
  executionId: string;
  status: string;
  results: TestResult[];
  stdout: string;
  stderr: string;
  durationMs: number;
  /** "mock" means the backend's demo runner, which does not execute code. */
  runner: string;
};

export type SubmitResult = { submitted: true; visibleResults: TestResult[]; runner: string };

export function getCandidateSession(candidateToken: string): Promise<CandidateSessionInfo> {
  return apiRequest<CandidateSessionInfo>("/candidate/session", { bearer: candidateToken });
}

export function postMediaReady(candidateToken: string, tracks: { camera: boolean; microphone: boolean; screen: boolean }): Promise<{ ready: true }> {
  return apiRequest<{ ready: true }>("/candidate/media-ready", { method: "POST", body: { tracks }, bearer: candidateToken });
}

export function getCandidateTasks(candidateToken: string): Promise<CandidateTask[]> {
  return apiRequest<CandidateTask[]>("/candidate/tasks", { bearer: candidateToken });
}

export function runCandidateTask(candidateToken: string, taskId: string, input: { language: string; code: string }): Promise<RunResult> {
  return apiRequest<RunResult>(`/candidate/tasks/${encodeURIComponent(taskId)}/run`, { method: "POST", body: input, bearer: candidateToken });
}

export function submitCandidateTask(candidateToken: string, taskId: string, input: { language: string; code: string }): Promise<SubmitResult> {
  return apiRequest<SubmitResult>(`/candidate/tasks/${encodeURIComponent(taskId)}/submit`, { method: "POST", body: input, bearer: candidateToken });
}
