import { z } from "zod";
import { AdjudicationAction, FlagSeverity, FlagStatus } from "../generated/prisma/enums.js";

const flagStatus = z.enum(Object.values(FlagStatus) as [FlagStatus, ...FlagStatus[]]);
const flagSeverity = z.enum(Object.values(FlagSeverity) as [FlagSeverity, ...FlagSeverity[]]);
const adjudicationAction = z.enum(Object.values(AdjudicationAction) as [AdjudicationAction, ...AdjudicationAction[]]);

export const listFlagsSchema = {
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    status: flagStatus.optional(),
    severity: flagSeverity.optional(),
  }),
};

export const adjudicateFlagSchema = {
  params: z.object({ flagId: z.string().min(1) }),
  body: z
    .object({
      action: adjudicationAction,
      toSeverity: flagSeverity.optional(),
      reason: z.string().trim().min(1).max(2000),
    })
    .refine((body) => body.action !== "DOWNGRADE" || body.toSeverity !== undefined, {
      message: "toSeverity is required when action is DOWNGRADE.",
      path: ["toSeverity"],
    }),
};

export const listNotesSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const addNoteSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ body: z.string().trim().min(1).max(4000) }),
};

export const suggestionsRefreshSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const acceptSuggestionSchema = {
  params: z.object({ id: z.string().min(1), suggestionId: z.string().min(1) }),
};
