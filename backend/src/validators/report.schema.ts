import { z } from "zod";

export const reportIdParamSchema = {
  params: z.object({ reportId: z.string().min(1) }),
};
