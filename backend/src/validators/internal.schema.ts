import { z } from "zod";
import { MonitoringChannel, Speaker } from "../generated/prisma/enums.js";

const channel = z.enum(Object.values(MonitoringChannel) as [MonitoringChannel, ...MonitoringChannel[]]);
const speaker = z.enum(Object.values(Speaker) as [Speaker, ...Speaker[]]);

export const observationsSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    producer: z.enum(["cv", "asr"]),
    items: z
      .array(
        z.object({
          channel,
          type: z.string().min(1),
          ts: z.iso.datetime(),
          strength: z.number().min(0).max(1),
          payload: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .min(1),
  }),
};

export const transcriptSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    segments: z
      .array(
        z.object({
          speaker,
          speakerLabel: z.string().optional(),
          text: z.string().min(1),
          startMs: z.number().int().min(0),
          endMs: z.number().int().min(0),
          isFinal: z.boolean(),
          words: z.unknown().optional(),
        }),
      )
      .min(1),
  }),
};

export const heartbeatSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    producer: z.string().min(1),
    channels: z.array(channel),
    status: z.enum(["OK", "DEGRADED"]),
  }),
};
