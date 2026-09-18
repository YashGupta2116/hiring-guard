import { apiRequestPage } from "./client";

export type CodingTaskSummary = {
  id: string;
  title: string;
  statement: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  languages: string[];
  timeLimitMs: number;
};

const DIFFICULTY_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;

export function difficultyLabel(d: CodingTaskSummary["difficulty"]): string {
  return DIFFICULTY_LABEL[d];
}

export async function listCodingTasks(): Promise<CodingTaskSummary[]> {
  const { data } = await apiRequestPage<CodingTaskSummary[], unknown>("/coding-tasks?limit=100");
  return data;
}
