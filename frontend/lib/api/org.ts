import { apiRequest, apiRequestPage } from "./client";

export type BackendRoleCode = "OWNER" | "ADMIN" | "INTERVIEWER" | "REVIEWER";

export type OrgMember = { id: string; userId: string; name: string; email: string; role: BackendRoleCode };

export type Org = { id: string; name: string; slug: string };

export const ROLES: { code: BackendRoleCode; label: string; description: string }[] = [
  { code: "OWNER", label: "Owner", description: "Full control, including other owners" },
  { code: "ADMIN", label: "Admin", description: "Manages people, questions and interviews" },
  { code: "INTERVIEWER", label: "Interviewer", description: "Runs interviews they are assigned to" },
  { code: "REVIEWER", label: "Reviewer", description: "Read-only access to interviews and reports" },
];

export function roleLabel(code: BackendRoleCode): string {
  return ROLES.find((r) => r.code === code)?.label ?? code;
}

export async function listMembers(): Promise<OrgMember[]> {
  const { data } = await apiRequestPage<OrgMember[], unknown>("/org/members");
  return data;
}

export const getOrg = () => apiRequest<Org>("/org");

export const updateOrgName = (name: string) => apiRequest<Org>("/org", { method: "PATCH", body: { name } });

export const addMember = (email: string, role: BackendRoleCode) =>
  apiRequest<{ id: string; userId: string; role: BackendRoleCode }>("/org/members", { method: "POST", body: { email, role } });

export const updateMemberRole = (memberId: string, role: BackendRoleCode) =>
  apiRequest<{ id: string; role: BackendRoleCode }>(`/org/members/${encodeURIComponent(memberId)}`, { method: "PATCH", body: { role } });

export const removeMember = (memberId: string) => apiRequest<void>(`/org/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });

export function memberAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
