import { z } from "zod";
import { JoinLinkKind } from "../generated/prisma/enums.js";

const kind = z.enum(Object.values(JoinLinkKind) as [JoinLinkKind, ...JoinLinkKind[]]);

export const createLinkSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    kind,
    validFrom: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime(),
    sendInvite: z.boolean().default(false),
  }),
};

export const listLinksSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const revokeLinkSchema = {
  params: z.object({ id: z.string().min(1), linkId: z.string().min(1) }),
};
