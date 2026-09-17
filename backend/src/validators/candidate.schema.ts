import { z } from "zod";

export const mediaReadySchema = {
  body: z.object({
    tracks: z.object({
      camera: z.boolean(),
      microphone: z.boolean(),
      screen: z.boolean(),
    }),
  }),
};
