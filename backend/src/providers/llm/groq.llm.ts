import { parsedJdSchema, type ParsedJD } from "../../types/parsed-jd.js";
import type { GradeInput, GradeResult, LlmProvider, SuggestInput, SuggestedQuestion } from "./llm.provider.js";

// Groq's Chat Completions API is OpenAI-compatible (https://console.groq.com/docs/api-reference).
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const suggestionsSchema = { questions: [{ rank: 1, topic: "string or null", text: "string", rationale: "string" }] };
const gradeSchema = {
  correctness: "0-100",
  depth: "0-100",
  specificity: "0-100",
  structure: "0-100",
  handsOn: "0-100",
  strengths: ["string"],
  concerns: ["string"],
};

export class GroqLlmProvider implements LlmProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  private async complete(system: string, user: string): Promise<Record<string, unknown>> {
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq API responded ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq API returned no message content.");
    return JSON.parse(content) as Record<string, unknown>;
  }

  async parseJd(text: string, totalMinutes: number): Promise<ParsedJD> {
    const raw = await this.complete(
      "You extract a structured job description from raw text for a technical interview platform. " +
        "Respond with ONLY a JSON object matching this exact shape (no prose, no markdown fences): " +
        `{"role": string, "seniority": "INTERN"|"JUNIOR"|"MID"|"SENIOR"|"STAFF"|"PRINCIPAL"|"UNKNOWN", ` +
        `"summary": string (max 2000 chars), ` +
        `"skills": [{"name": string, "weight": number 0-1}] (weights across all skills should roughly sum to 1), ` +
        `"topics": [{"name": string, "skills": [string], "budgetSeconds": integer}]}. ` +
        `Split the interview's total time budget of ${totalMinutes} minutes (reserve ~10 minutes for intro/wrap-up) ` +
        "across topics as budgetSeconds, proportional to each topic's importance.",
      text.slice(0, 12_000),
    );
    const parsed = parsedJdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Groq returned a JD that doesn't match the expected schema: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async suggestQuestions(input: SuggestInput): Promise<SuggestedQuestion[]> {
    const raw = await this.complete(
      "You suggest the next interview questions for a live technical interview, given the job description, " +
        "topics already covered, and a tail of the transcript so far. Respond with ONLY a JSON object " +
        `matching this exact shape (no prose, no markdown fences): ${JSON.stringify(suggestionsSchema)}. ` +
        "Return exactly 3 questions, ranked 1-3, each with a short rationale for why it's a good next question.",
      JSON.stringify({
        parsedJd: input.parsedJd,
        coveredTopics: input.coveredTopics,
        currentTopic: input.currentTopic,
        transcriptTail: input.transcriptTail,
        difficulty: input.difficulty,
      }),
    );
    const questions = (raw as { questions?: unknown }).questions;
    if (!Array.isArray(questions)) throw new Error("Groq returned suggestions with no questions array.");
    return questions.map((q, i) => {
      const item = q as { rank?: number; topic?: string | null; text?: string; rationale?: string };
      if (!item.text || !item.rationale) throw new Error(`Groq suggestion ${i} is missing text or rationale.`);
      return { rank: item.rank ?? i + 1, topic: item.topic ?? null, text: item.text, rationale: item.rationale };
    });
  }

  async gradeAnswer(input: GradeInput): Promise<GradeResult> {
    const raw = await this.complete(
      "You grade a candidate's spoken interview answer against a rubric. Score each dimension 0-100. " +
        "Never score accent, fluency, grammar, speaking pace or silence -- only substance. Respond with ONLY " +
        `a JSON object matching this exact shape (no prose, no markdown fences): ${JSON.stringify(gradeSchema)}.`,
      JSON.stringify({ question: input.question, answer: input.answer, topic: input.topic, parsedJd: input.parsedJd }),
    );
    const g = raw as Partial<GradeResult>;
    const dims: (keyof GradeResult)[] = ["correctness", "depth", "specificity", "structure", "handsOn"];
    for (const dim of dims) {
      if (typeof g[dim] !== "number") throw new Error(`Groq grade is missing numeric "${dim}".`);
    }
    return {
      correctness: g.correctness as number,
      depth: g.depth as number,
      specificity: g.specificity as number,
      structure: g.structure as number,
      handsOn: g.handsOn as number,
      strengths: Array.isArray(g.strengths) ? (g.strengths as string[]) : [],
      concerns: Array.isArray(g.concerns) ? (g.concerns as string[]) : [],
    };
  }
}
