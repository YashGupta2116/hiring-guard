import { z } from "zod";
import { Difficulty } from "../generated/prisma/enums.js";

const difficulty = z.enum(Object.values(Difficulty) as [Difficulty, ...Difficulty[]]);

export const createQuestionSchema = {
  body: z.object({
    text: z.string().trim().min(1).max(2000),
    topic: z.string().trim().min(1).max(100),
    skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    difficulty,
  }),
};

export const listQuestionsSchema = {
  query: z.object({
    topic: z.string().trim().min(1).max(100).optional(),
    difficulty: difficulty.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const questionIdParamSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const updateQuestionSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      text: z.string().trim().min(1).max(2000),
      topic: z.string().trim().min(1).max(100),
      skills: z.array(z.string().trim().min(1).max(60)).max(20),
      difficulty,
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." }),
};
