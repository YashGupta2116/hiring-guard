import { z } from "zod";

export const listReportsSchema = {
  query: z.object({
    q: z.string().trim().min(1).max(200).optional(),
    /** Integrity band, using the same 85 / 70 cut-offs as the composite-score formula. */
    band: z.enum(["HIGH", "MODERATE", "REVIEW"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const reportIdParamSchema = {
  params: z.object({ reportId: z.string().min(1) }),
};
