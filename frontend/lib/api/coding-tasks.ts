import { apiRequest, apiRequestPage } from "./client";

export type DifficultyCode = "EASY" | "MEDIUM" | "HARD";

export type TestCase = { input: string; expectedOutput: string };

export type CodingTaskSummary = {
  id: string;
  title: string;
  statement: string;
  difficulty: DifficultyCode;
  languages: string[];
  starterCode: Record<string, string> | null;
  visibleTests: TestCase[];
  timeLimitMs: number;
  createdAt: string;
  updatedAt: string;
};

/** The single-task response; `hiddenTests` is only present for owners and admins. */
export type CodingTaskDetail = CodingTaskSummary & { hiddenTests?: TestCase[] };

export type CodingTaskInput = {
  title: string;
  statement: string;
  difficulty: DifficultyCode;
  languages: string[];
  starterCode?: Record<string, string>;
  visibleTests: TestCase[];
  hiddenTests: TestCase[];
  timeLimitMs: number;
};

export const DIFFICULTIES: { code: DifficultyCode; label: string }[] = [
  { code: "EASY", label: "Easy" },
  { code: "MEDIUM", label: "Medium" },
  { code: "HARD", label: "Hard" },
];

export function difficultyLabel(d: DifficultyCode): string {
  return DIFFICULTIES.find((x) => x.code === d)?.label ?? d;
}

/** The languages the sandbox runner has an image for. */
export const TASK_LANGUAGES: { code: string; label: string }[] = [
  { code: "python", label: "Python" },
  { code: "javascript", label: "JavaScript" },
];

export async function listCodingTasks(): Promise<CodingTaskSummary[]> {
  const { data } = await apiRequestPage<CodingTaskSummary[], unknown>("/coding-tasks?limit=100");
  return data;
}

export const getCodingTask = (id: string) => apiRequest<CodingTaskDetail>(`/coding-tasks/${encodeURIComponent(id)}`);

export const createCodingTask = (input: CodingTaskInput) => apiRequest<CodingTaskDetail>("/coding-tasks", { method: "POST", body: input });

export const updateCodingTask = (id: string, patch: Partial<CodingTaskInput>) =>
  apiRequest<CodingTaskDetail>(`/coding-tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });

export const deleteCodingTask = (id: string) => apiRequest<void>(`/coding-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
