import { apiRequest, apiRequestPage } from "@/lib/api/client";
import type { ApiSession } from "@/lib/api/sessions";

export type FlagSeverity = "LOW" | "MEDIUM" | "HIGH";
export type FlagStatus = "OPEN" | "CONFIRMED" | "DISMISSED" | "DOWNGRADED" | "SUPERSEDED";
export type WarningTier = "NOTICE" | "WARNING" | "INTERRUPT";

export type LiveFlag = {
  id: string;
  type: string;
  channel: string;
  corroboratingChannels: string[];
  severity: FlagSeverity;
  status: FlagStatus;
  origin: string;
  narrative: string;
  startTs: string;
  endTs: string | null;
  mediaOffsetMs: number | null;
  /** Integrity points this flag cost (positive = points lost). */
  scoreDelta: number;
  mergedCount: number;
  supersededByReview: boolean;
  /** Present on REST responses only; socket frames omit it. */
  warning?: { tier: WarningTier; shownAt: string; acknowledgedAt: string | null; ackLatencyMs: number | null } | null;
  adjudications?: { id: string; action: string; fromSeverity: FlagSeverity; toSeverity: FlagSeverity | null; reason: string; createdAt: string }[];
};

export type LiveNote = { id: string; sessionId: string; authorId: string; body: string; ts: string; mediaOffsetMs: number | null };

export type LiveSnapshot = {
  status: string;
  startedAt: string | null;
  calibrationEndsAt: string | null;
  elapsedMs: number;
  remainingMs: number;
  mediaReady: boolean;
  candidateConnected: boolean;
  integrity: { score: number; calibrating: boolean } | null;
  flags: LiveFlag[];
  notes: LiveNote[];
  warningCount?: number;
  lastFrameSeq: number;
};

export type SuggestionItem = { id: string; rank: number; text: string; rationale: string; topic: string | null };
export type SuggestionBatch = { batchId: string; source: "MODEL" | "QUESTION_BANK"; coverage: { topic: string; covered: boolean }[]; items: SuggestionItem[] };

export type CodeExecution = {
  id: string;
  kind: "RUN" | "SUBMIT";
  status: string;
  language: string;
  visibleResults: { index: number; passed: boolean }[] | null;
  hiddenResults: { index: number; passed: boolean }[] | null;
  stdout: string | null;
  stderr: string | null;
  createdAt: string;
};

export type CodeSnapshot = { id: string; language: string; content: string; reason: string; createdAt: string };

export type SessionCodeTask = {
  taskId: string;
  title: string;
  languages: string[];
  frozen: boolean;
  submittedAt: string | null;
  snapshots: CodeSnapshot[];
  executions: CodeExecution[];
  /** "mock" is the demo runner, which does not execute code. */
  runner: string;
};

const s = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const getLiveSnapshot = (id: string) => apiRequest<LiveSnapshot>(`${s(id)}/live`);
export const startLiveSession = (id: string) => apiRequest<ApiSession>(`${s(id)}/start`, { method: "POST" });
export const endLiveSession = (id: string) => apiRequest<ApiSession>(`${s(id)}/end`, { method: "POST" });

export async function listFlags(id: string): Promise<LiveFlag[]> {
  const { data } = await apiRequestPage<LiveFlag[], unknown>(`${s(id)}/flags`);
  return data;
}

export const adjudicateFlag = (flagId: string, input: { action: "CONFIRM" | "DISMISS" | "DOWNGRADE"; reason: string; toSeverity?: FlagSeverity }) =>
  apiRequest<unknown>(`/flags/${encodeURIComponent(flagId)}/adjudicate`, { method: "POST", body: input });

export const refreshSuggestions = (id: string) => apiRequest<SuggestionBatch>(`${s(id)}/suggestions/refresh`, { method: "POST" });
export const acceptSuggestion = (id: string, suggestionId: string) =>
  apiRequest<unknown>(`${s(id)}/suggestions/${encodeURIComponent(suggestionId)}/accept`, { method: "POST" });

export const getSessionCode = (id: string) => apiRequest<SessionCodeTask[]>(`${s(id)}/code`);

export const assignLiveTask = (id: string, taskId: string) =>
  apiRequest<{ sessionTaskId: string; alreadyAssigned: boolean }>(`${s(id)}/tasks`, { method: "POST", body: { taskId } });

export const openSessionRoom = (id: string) => apiRequest<{ open: boolean }>(`${s(id)}/open-room`, { method: "POST" });
