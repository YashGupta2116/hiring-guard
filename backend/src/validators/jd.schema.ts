import { z } from "zod";
import { parsedJdSchema } from "../types/parsed-jd.js";

export const jdTextBodySchema = {
  body: z.object({
    text: z.string().trim().min(1).max(200_000),
  }),
};

export const jdSessionParamSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const patchJdSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ parsed: parsedJdSchema }),
};
