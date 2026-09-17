import { z } from "zod";
import { OrgRole } from "../generated/prisma/enums.js";

const orgRole = z.enum(Object.values(OrgRole) as [OrgRole, ...OrgRole[]]);

export const updateOrgSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
  }),
};

export const addMemberSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    role: orgRole,
  }),
};

export const updateMemberSchema = {
  params: z.object({ memberId: z.string().min(1) }),
  body: z.object({
    role: orgRole,
  }),
};

export const removeMemberSchema = {
  params: z.object({ memberId: z.string().min(1) }),
};
