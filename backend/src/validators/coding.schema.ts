import { z } from "zod";

const taskIdParams = z.object({ taskId: z.string().min(1) });

export const runTaskSchema = {
  params: taskIdParams,
  body: z.object({
    language: z.string().trim().min(1).max(40),
    code: z.string().max(200_000),
  }),
};

export const submitTaskSchema = runTaskSchema;
