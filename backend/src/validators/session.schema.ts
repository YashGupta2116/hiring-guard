import { z } from "zod";
import { InterviewMode, SessionStatus } from "../generated/prisma/enums.js";
import { SESSION_LIST_MAX_LIMIT } from "../config/constants.js";

const mode = z.enum(Object.values(InterviewMode) as [InterviewMode, ...InterviewMode[]]);
const status = z.enum(Object.values(SessionStatus) as [SessionStatus, ...SessionStatus[]]);

export const createSessionSchema = {
  body: z.object({
    mode,
    title: z.string().trim().min(1).max(200).optional(),
    candidateEmail: z.string().trim().toLowerCase().email().optional(),
    candidateName: z.string().trim().min(1).max(120).optional(),
    scheduledAt: z.iso.datetime().optional(),
    durationMinutes: z.coerce.number().int().min(15).max(240).default(60),
  }),
};

export const listSessionsSchema = {
  query: z.object({
    status: status.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(SESSION_LIST_MAX_LIMIT).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const listAuditLogSchema = {
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(SESSION_LIST_MAX_LIMIT).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const sessionIdParamSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const updateSessionSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().trim().min(1).max(200).nullable(),
      candidateEmail: z.string().trim().toLowerCase().email(),
      candidateName: z.string().trim().min(1).max(120).nullable(),
      scheduledAt: z.iso.datetime().nullable(),
      durationMinutes: z.coerce.number().int().min(15).max(240),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." }),
};

export const addInterviewerSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ userId: z.string().min(1) }),
};

export const removeInterviewerSchema = {
  params: z.object({ id: z.string().min(1), userId: z.string().min(1) }),
};
