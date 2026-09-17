import type { OrgRole } from "../generated/prisma/enums.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { log } from "./audit.service.js";

export async function getOrg(orgId: string): Promise<{ id: string; name: string; slug: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    throw new AppError("NOT_FOUND", "Organisation not found.");
  }
  return { id: org.id, name: org.name, slug: org.slug };
}

export async function updateOrg(orgId: string, name: string): Promise<{ id: string; name: string; slug: string }> {
  const org = await prisma.organization.update({ where: { id: orgId }, data: { name } });
  return { id: org.id, name: org.name, slug: org.slug };
}

export async function listMembers(
  orgId: string,
): Promise<{ id: string; userId: string; name: string; email: string; role: OrgRole }[]> {
  const members = await prisma.orgMember.findMany({
    where: { orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }));
}

export async function addMember(orgId: string, email: string, role: OrgRole): Promise<{ id: string; userId: string; role: OrgRole }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError("NOT_FOUND", "No user with this email exists.");
  }

  const member = await prisma.orgMember.create({ data: { orgId, userId: user.id, role } });
  await log({ orgId, actorType: "USER", action: "org.member_added", metadata: { userId: user.id, role } });
  return { id: member.id, userId: member.userId, role: member.role };
}

/** Confirms the member belongs to this org (never trust memberId alone) and blocks demoting/removing the last owner. */
async function getRemovableMember(orgId: string, memberId: string, nextRole?: OrgRole): Promise<{ id: string }> {
  const member = await prisma.orgMember.findFirst({ where: { id: memberId, orgId } });
  if (!member) {
    throw new AppError("NOT_FOUND", "Member not found.");
  }
  if (member.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await prisma.orgMember.count({ where: { orgId, role: "OWNER" } });
    if (ownerCount <= 1) {
      throw new AppError("LAST_OWNER", "Cannot remove or demote the last owner of the organisation.");
    }
  }
  return { id: member.id };
}

export async function updateMemberRole(orgId: string, memberId: string, role: OrgRole): Promise<{ id: string; role: OrgRole }> {
  const target = await getRemovableMember(orgId, memberId, role);
  const member = await prisma.orgMember.update({ where: { id: target.id }, data: { role } });
  await log({ orgId, actorType: "USER", action: "org.member_role_changed", metadata: { memberId, role } });
  return { id: member.id, role: member.role };
}

export async function removeMember(orgId: string, memberId: string): Promise<void> {
  const target = await getRemovableMember(orgId, memberId);
  await prisma.orgMember.delete({ where: { id: target.id } });
  await log({ orgId, actorType: "USER", action: "org.member_removed", metadata: { memberId } });
}
