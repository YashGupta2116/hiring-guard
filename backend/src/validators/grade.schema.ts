import { z } from "zod";

/**
 * Rubric validation for `LlmProvider.gradeAnswer()` output (Phases.md §10: "rubric validation
 * rejects forbidden dimensions"). `.strict()` means any field beyond these five dimensions plus
 * strengths/concerns — accent, fluency, grammar, pace, silence, or anything else a future real
 * provider might add — fails validation instead of silently passing through into a report
 * (Architecture.md §6.9: communication is "never accent/fluency/pace/silence"; PRD/Rules.md
 * forbid scoring them at all). The mock provider already only returns these five, so this is a
 * defense-in-depth gate against whatever provider replaces it later, not a fix for anything wrong
 * today.
 */
export const gradeResultSchema = z
  .object({
    correctness: z.number().min(0).max(100),
    depth: z.number().min(0).max(100),
    specificity: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    handsOn: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    concerns: z.array(z.string()),
  })
  .strict();
