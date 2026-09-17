import type { ParsedJD } from "../../types/parsed-jd.js";
import type { GradeInput, GradeResult, LlmProvider, SuggestInput, SuggestedQuestion } from "./llm.provider.js";

const SKILL_TOPICS: Record<string, string> = {
  javascript: "Language fundamentals",
  typescript: "Language fundamentals",
  python: "Language fundamentals",
  java: "Language fundamentals",
  golang: "Language fundamentals",
  "node.js": "Backend development",
  express: "Backend development",
  react: "Frontend development",
  "next.js": "Frontend development",
  postgresql: "Databases",
  mysql: "Databases",
  mongodb: "Databases",
  redis: "Databases",
  sql: "Databases",
  docker: "DevOps",
  kubernetes: "DevOps",
  aws: "Cloud",
  "system design": "System design",
  "rest api": "API design",
  graphql: "API design",
  "data structures": "Algorithms",
  algorithms: "Algorithms",
};

const SENIORITY_PATTERNS: Array<[RegExp, ParsedJD["seniority"]]> = [
  [/\bprincipal\b/i, "PRINCIPAL"],
  [/\bstaff\b/i, "STAFF"],
  [/\bsenior\b|\bsr\.?\s|\blead\b/i, "SENIOR"],
  [/\bjunior\b|\bjr\.?\s|\bentry[- ]level\b/i, "JUNIOR"],
  [/\bintern(ship)?\b/i, "INTERN"],
  [/\bmid[- ]level\b/i, "MID"],
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic, keyword-based stand-in for the real model so the whole flow runs offline.
 * It is not intelligent. Replace with a real provider behind the same interface later.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async parseJd(text: string, totalMinutes: number): Promise<ParsedJD> {
    const firstLine = text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "Software Engineer";
    const seniority = SENIORITY_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? "UNKNOWN";

    const counts = Object.keys(SKILL_TOPICS)
      .map((skill) => ({
        skill,
        count: (text.match(new RegExp(`(^|[^a-z])${escapeRegex(skill)}([^a-z]|$)`, "gi")) ?? []).length,
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const total = counts.reduce((sum, entry) => sum + entry.count, 0) || 1;
    const skills = counts.map((entry) => ({ name: entry.skill, weight: Number((entry.count / total).toFixed(3)) }));

    const topicMap = new Map<string, { skills: string[]; weight: number }>();
    for (const skill of skills) {
      const topic = SKILL_TOPICS[skill.name] ?? "General";
      const current = topicMap.get(topic) ?? { skills: [], weight: 0 };
      current.skills.push(skill.name);
      current.weight += skill.weight;
      topicMap.set(topic, current);
    }

    const budgetSeconds = Math.max(totalMinutes - 10, 5) * 60; // 10 min reserved for intro and wrap-up
    const topics = [...topicMap.entries()].map(([name, value]) => ({
      name,
      skills: value.skills,
      budgetSeconds: Math.round(budgetSeconds * value.weight),
    }));

    return {
      role: firstLine.slice(0, 200),
      seniority,
      summary: text.replace(/\s+/g, " ").trim().slice(0, 300),
      skills,
      topics,
    };
  }

  async suggestQuestions(input: SuggestInput): Promise<SuggestedQuestion[]> {
    const topics = input.parsedJd?.topics.map((topic) => topic.name) ?? [];
    const uncovered = topics.filter((topic) => !input.coveredTopics.includes(topic));
    const focus = input.currentTopic ?? uncovered[0] ?? topics[0] ?? "General";
    const next = uncovered.find((topic) => topic !== focus) ?? focus;
    const angle = input.difficulty === "HARD" ? "its trade-offs and failure modes" : input.difficulty === "MEDIUM" ? "a real project" : "the basics";

    return [
      { rank: 1, topic: focus, text: `Walk me through how you have used ${focus.toLowerCase()}, focusing on ${angle}.`, rationale: `Probes hands-on experience in ${focus}.` },
      { rank: 2, topic: focus, text: `Tell me about the last time something went wrong with ${focus.toLowerCase()} and how you fixed it.`, rationale: "Checks debugging depth and ownership." },
      { rank: 3, topic: next, text: `How would you explain ${next.toLowerCase()} to a new teammate?`, rationale: "Moves coverage to a topic not yet discussed." },
    ];
  }

  async gradeAnswer(input: GradeInput): Promise<GradeResult> {
    const words = input.answer.trim().split(/\s+/).filter(Boolean).length;
    const lengthScore = Math.min(100, Math.round((words / 120) * 100));
    const hasExample = /\b(for example|in my|we built|i built|i implemented|at my)\b/i.test(input.answer);
    return {
      correctness: Math.max(40, lengthScore - 10),
      depth: lengthScore,
      specificity: hasExample ? Math.max(60, lengthScore) : Math.round(lengthScore * 0.7),
      structure: Math.max(50, lengthScore - 5),
      handsOn: hasExample ? 75 : 45,
      strengths: hasExample ? ["Gave a concrete example from experience."] : [],
      concerns: words < 30 ? ["Answer was brief; limited evidence of depth."] : [],
    };
  }
}
