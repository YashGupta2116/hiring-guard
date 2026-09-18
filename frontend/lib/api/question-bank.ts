import { apiRequest, apiRequestPage } from "./client";
import type { DifficultyCode } from "./coding-tasks";

export type BankQuestion = {
  id: string;
  text: string;
  topic: string;
  skills: string[];
  difficulty: DifficultyCode;
  createdAt: string;
};

export type BankQuestionInput = { text: string; topic: string; skills: string[]; difficulty: DifficultyCode };

const PAGE = 100;
const MAX_PAGES = 10;

export async function listQuestions(): Promise<{ items: BankQuestion[]; truncated: boolean }> {
  const items: BankQuestion[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, meta } = await apiRequestPage<BankQuestion[], { nextCursor: string | null }>(
      `/question-bank?limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...data);
    if (!meta.nextCursor) return { items, truncated: false };
    cursor = meta.nextCursor;
  }
  return { items, truncated: true };
}

export const createQuestion = (input: BankQuestionInput) => apiRequest<BankQuestion>("/question-bank", { method: "POST", body: input });

export const updateQuestion = (id: string, patch: Partial<BankQuestionInput>) =>
  apiRequest<BankQuestion>(`/question-bank/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });

export const deleteQuestion = (id: string) => apiRequest<void>(`/question-bank/${encodeURIComponent(id)}`, { method: "DELETE" });
