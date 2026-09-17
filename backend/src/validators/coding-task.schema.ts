import { z } from "zod";
import { Difficulty } from "../generated/prisma/enums.js";

const difficulty = z.enum(Object.values(Difficulty) as [Difficulty, ...Difficulty[]]);

const testCase = z.object({
  input: z.string().max(50_000),
  expectedOutput: z.string().max(50_000),
});

export const createCodingTaskSchema = {
  body: z.object({
    title: z.string().trim().min(1).max(200),
    statement: z.string().trim().min(1).max(20_000),
    difficulty,
    languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
    starterCode: z.record(z.string(), z.string().max(50_000)).optional(),
    visibleTests: z.array(testCase).min(1).max(50),
    hiddenTests: z.array(testCase).min(1).max(50),
    timeLimitMs: z.coerce.number().int().min(500).max(60_000).default(5000),
  }),
};

export const listCodingTasksSchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const codingTaskIdParamSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const updateCodingTaskSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().trim().min(1).max(200),
      statement: z.string().trim().min(1).max(20_000),
      difficulty,
      languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
      starterCode: z.record(z.string(), z.string().max(50_000)),
      visibleTests: z.array(testCase).min(1).max(50),
      hiddenTests: z.array(testCase).min(1).max(50),
      timeLimitMs: z.coerce.number().int().min(500).max(60_000),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." }),
};
