import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(128);

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    email,
    password,
    orgName: z.string().trim().min(1).max(120),
  }),
};

export const loginSchema = {
  body: z.object({
    email,
    password: z.string().min(1).max(128),
  }),
};

export const switchOrgSchema = {
  body: z.object({
    orgId: z.string().min(1),
  }),
};

export const updateProfileSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
  }),
};
