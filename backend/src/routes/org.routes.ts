import { Router } from "express";
import { addMember, getOrg, listMembers, removeMember, updateMember, updateOrg } from "../controllers/org.controller.js";
import { requireUser } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/org-role.js";
import { validate } from "../middlewares/validate.js";
import { addMemberSchema, removeMemberSchema, updateMemberSchema, updateOrgSchema } from "../validators/org.schema.js";

export const orgRouter = Router();

orgRouter.use("/org", requireUser);

orgRouter.get("/org", getOrg);
orgRouter.patch("/org", requireRole("OWNER", "ADMIN"), validate(updateOrgSchema), updateOrg);
orgRouter.get("/org/members", listMembers);
orgRouter.post("/org/members", requireRole("OWNER", "ADMIN"), validate(addMemberSchema), addMember);
orgRouter.patch("/org/members/:memberId", requireRole("OWNER", "ADMIN"), validate(updateMemberSchema), updateMember);
orgRouter.delete("/org/members/:memberId", requireRole("OWNER", "ADMIN"), validate(removeMemberSchema), removeMember);
