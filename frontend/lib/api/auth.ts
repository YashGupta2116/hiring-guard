import type { User, UserRole } from "@/lib/types";
import { apiRequest, refreshAccessToken, setAccessToken } from "./client";

export type BackendRole = "OWNER" | "ADMIN" | "INTERVIEWER" | "REVIEWER";

type ApiUser = { id: string; name: string; email: string };
type Membership = { orgId: string; orgName: string; role: BackendRole };
type MeResponse = { user: ApiUser; memberships: Membership[]; activeOrgId: string | null };

/** The signed-in user as the UI sees it: the `User` shape plus the org they are acting in. */
export type AuthUser = User & { orgId: string; orgName: string; backendRole: BackendRole };

const ROLE_LABEL: Record<BackendRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  INTERVIEWER: "Interviewer",
  REVIEWER: "Reviewer",
};

/** Backend roles collapse onto the three UI permission levels. */
export function toUiRole(role: BackendRole): UserRole {
  if (role === "OWNER" || role === "ADMIN") return "Admin";
  if (role === "INTERVIEWER") return "Interviewer";
  return "Viewer";
}

function toAuthUser(me: MeResponse): AuthUser {
  const membership = me.memberships.find((m) => m.orgId === me.activeOrgId) ?? me.memberships[0];
  if (!membership) throw new Error("This account is not a member of any organisation.");
  return {
    id: me.user.id,
    name: me.user.name,
    email: me.user.email,
    role: toUiRole(membership.role),
    avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(me.user.name)}`,
    title: `${ROLE_LABEL[membership.role]} · ${membership.orgName}`,
    orgId: membership.orgId,
    orgName: membership.orgName,
    backendRole: membership.role,
  };
}

export async function fetchMe(): Promise<AuthUser> {
  return toAuthUser(await apiRequest<MeResponse>("/auth/me"));
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiRequest<{ accessToken: string }>("/auth/login", { method: "POST", body: { email, password }, auth: false });
  setAccessToken(res.accessToken);
  return fetchMe();
}

export async function register(input: { name: string; email: string; password: string; orgName: string }): Promise<AuthUser> {
  const res = await apiRequest<{ accessToken: string }>("/auth/register", { method: "POST", body: input, auth: false });
  setAccessToken(res.accessToken);
  return fetchMe();
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout", { method: "POST", auth: false });
  } finally {
    setAccessToken(null);
  }
}

/** Restores a session from the refresh cookie on page load. Resolves null when signed out. */
export async function restoreSession(): Promise<AuthUser | null> {
  const token = await refreshAccessToken();
  if (!token) return null;
  return fetchMe();
}
