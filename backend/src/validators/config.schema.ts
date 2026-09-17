import { z } from "zod";
import { Difficulty, InterviewType, MonitoringChannel, Sensitivity } from "../generated/prisma/enums.js";

const interviewType = z.enum(Object.values(InterviewType) as [InterviewType, ...InterviewType[]]);
const difficulty = z.enum(Object.values(Difficulty) as [Difficulty, ...Difficulty[]]);
const sensitivity = z.enum(Object.values(Sensitivity) as [Sensitivity, ...Sensitivity[]]);
const channel = z.enum(Object.values(MonitoringChannel) as [MonitoringChannel, ...MonitoringChannel[]]);

export const patchConfigSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      interviewType,
      difficulty,
      recordVideo: z.boolean(),
      recordAudio: z.boolean(),
      recordScreen: z.boolean(),
      channels: z.array(channel).max(Object.values(MonitoringChannel).length),
      sensitivity,
      topicBudgets: z.record(z.string(), z.number().int().min(0)),
      taskIds: z.array(z.string().min(1)).max(50),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." }),
};
