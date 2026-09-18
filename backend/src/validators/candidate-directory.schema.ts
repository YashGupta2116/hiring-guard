import { z } from "zod";
import { CandidateStatus } from "../generated/prisma/enums.js";

const status = z.enum(Object.values(CandidateStatus) as [CandidateStatus, ...CandidateStatus[]]);

const text = (max: number) => z.string().trim().max(max);
const name = z.string().trim().min(1).max(120);
const experienceYears = z.coerce.number().int().min(0).max(60);
const skills = z.array(z.string().trim().min(1).max(60)).max(30);

export const listCandidatesSchema = {
  query: z.object({
    q: z.string().trim().min(1).max(200).optional(),
    status: status.optional(),
    appliedRole: z.string().trim().min(1).max(160).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
};

export const createCandidateSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    name: name.optional(),
    phone: text(40).optional(),
    appliedRole: text(160).optional(),
    location: text(160).optional(),
    experienceYears: experienceYears.optional(),
    bio: text(1000).optional(),
    skills: skills.optional(),
    notes: text(5000).optional(),
    status: status.optional(),
  }),
};

export const getCandidateSchema = {
  params: z.object({ id: z.string().min(1) }),
};

export const updateCandidateSchema = {
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name,
      phone: text(40).nullable(),
      appliedRole: text(160).nullable(),
      location: text(160).nullable(),
      experienceYears: experienceYears.nullable(),
      bio: text(1000).nullable(),
      skills,
      notes: text(5000).nullable(),
      status,
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." }),
};
