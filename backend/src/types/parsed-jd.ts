import { z } from "zod";

export const seniorityValues = ["INTERN", "JUNIOR", "MID", "SENIOR", "STAFF", "PRINCIPAL", "UNKNOWN"] as const;

export const parsedJdSchema = z.object({
  role: z.string().min(1).max(200),
  seniority: z.enum(seniorityValues),
  summary: z.string().max(2000),
  skills: z
    .array(z.object({ name: z.string().min(1).max(100), weight: z.number().min(0).max(1) }))
    .max(50),
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        skills: z.array(z.string()).max(20),
        budgetSeconds: z.number().int().min(0),
      }),
    )
    .max(20),
});

export type ParsedJD = z.infer<typeof parsedJdSchema>;
