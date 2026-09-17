import { z } from "zod";

export const listCandidatesSchema = {
  query: z.object({
    q: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const createCandidateSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1).max(120).optional(),
  }),
};

export const getCandidateSchema = {
  params: z.object({ id: z.string().min(1) }),
};
