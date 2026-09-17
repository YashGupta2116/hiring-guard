import { z } from "zod";

export const joinTokenParamSchema = {
  params: z.object({ token: z.string().min(1) }),
};

export const preflightSchema = {
  params: z.object({ token: z.string().min(1) }),
  body: z.object({
    webrtc: z.boolean(),
    getDisplayMedia: z.boolean(),
    camera: z.enum(["granted", "prompt", "denied", "unavailable"]),
    microphone: z.enum(["granted", "prompt", "denied", "unavailable"]),
    screenCount: z.coerce.number().int().min(0).max(20),
    isExtended: z.boolean(),
    downlinkMbps: z.coerce.number().min(0).max(10_000),
    hardwareConcurrency: z.coerce.number().int().min(1).max(256),
    userAgent: z.string().max(500),
  }),
};

export const consentSchema = {
  params: z.object({ token: z.string().min(1) }),
  body: z.object({
    preflightId: z.string().min(1),
    policyHash: z.string().min(1),
    accepted: z.boolean(),
    scrolledToEnd: z.literal(true),
  }),
};
