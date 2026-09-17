import type { ParsedJD } from "../../types/parsed-jd.js";

export type SuggestInput = {
  parsedJd: ParsedJD | null;
  coveredTopics: string[];
  currentTopic: string | null;
  /** Last 3000 characters of transcript. */
  transcriptTail: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

export type SuggestedQuestion = {
  rank: number;
  text: string;
  rationale: string;
  topic: string | null;
};

export type GradeInput = {
  question: string;
  answer: string;
  topic: string | null;
  parsedJd: ParsedJD | null;
};

/** Rubric dimensions only. Accent, fluency, grammar, pace and silence are never scored. */
export type GradeResult = {
  correctness: number;
  depth: number;
  specificity: number;
  structure: number;
  handsOn: number;
  strengths: string[];
  concerns: string[];
};

export interface LlmProvider {
  readonly name: string;
  parseJd(text: string, totalMinutes: number): Promise<ParsedJD>;
  suggestQuestions(input: SuggestInput): Promise<SuggestedQuestion[]>;
  gradeAnswer(input: GradeInput): Promise<GradeResult>;
}
