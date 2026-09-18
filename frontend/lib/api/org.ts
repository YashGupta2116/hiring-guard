import { apiRequestPage } from "./client";

export type BackendRoleCode = "OWNER" | "ADMIN" | "INTERVIEWER" | "REVIEWER";

export type OrgMember = { id: string; userId: string; name: string; email: string; role: BackendRoleCode };

export async function listMembers(): Promise<OrgMember[]> {
  const { data } = await apiRequestPage<OrgMember[], unknown>("/org/members");
  return data;
}

export function memberAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
