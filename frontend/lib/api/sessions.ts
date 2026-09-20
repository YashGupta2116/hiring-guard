import { apiRequest, apiRequestPage } from "./client";
import { sessionStatusLabel } from "./session-status";

export type SessionStatusCode =
  | "DRAFT"
  | "CONFIGURED"
  | "ARMED"
  | "ADMITTED"
  | "LIVE"
  | "SEALING"
  | "PROCESSING"
  | "COMPLETE"
  | "ABORTED"
  | "EXPIRED";

export type InterviewTypeCode = "TECHNICAL" | "CODING" | "SYSTEM_DESIGN" | "BEHAVIORAL" | "MIXED";

export const INTERVIEW_TYPES: { code: InterviewTypeCode; label: string }[] = [
  { code: "TECHNICAL", label: "Technical" },
  { code: "CODING", label: "Coding" },
  { code: "SYSTEM_DESIGN", label: "System Design" },
  { code: "BEHAVIORAL", label: "Behavioral" },
  { code: "MIXED", label: "Mixed" },
];

export function interviewTypeLabel(code: string | null): string {
  return INTERVIEW_TYPES.find((t) => t.code === code)?.label ?? "Not set";
}

export type MonitoringChannel =
  | "GAZE"
  | "FACE"
  | "IDENTITY"
  | "SCENE"
  | "AUDIO"
  | "SCREEN"
  | "FOCUS"
  | "PASTE"
  | "RHYTHM"
  | "POINTER"
  | "ENVIRONMENT";

/**
 * The scheduler exposes four monitoring switches; each turns on a group of backend detection channels.
 * Recording is a separate switch (the three `record*` flags).
 */
export type MonitoringKey = "webcam" | "screen" | "clipboard" | "gaze";

export const MONITORING_GROUPS: { key: MonitoringKey; channels: MonitoringChannel[] }[] = [
  { key: "webcam", channels: ["FACE", "SCENE"] },
  { key: "screen", channels: ["SCREEN", "FOCUS", "POINTER", "ENVIRONMENT"] },
  { key: "clipboard", channels: ["PASTE", "RHYTHM"] },
  { key: "gaze", channels: ["GAZE"] },
];

export function channelsFor(enabled: Record<MonitoringKey, boolean>): MonitoringChannel[] {
  return MONITORING_GROUPS.filter((g) => enabled[g.key]).flatMap((g) => g.channels);
}

export function monitoringEnabled(channels: string[], key: MonitoringKey): boolean {
  const group = MONITORING_GROUPS.find((g) => g.key === key);
  return !!group && group.channels.every((c) => channels.includes(c));
}

/** "unavailable" = recording was requested but the server has no provider that can make one. */
export function recordingState(config: ApiSession["config"]): "off" | "unavailable" | "on" {
  if (!(config.recordVideo || config.recordAudio || config.recordScreen)) return "off";
  return config.recordingAvailable ? "on" : "unavailable";
}

export type ApiSession = {
  id: string;
  orgId: string;
  mode: "SCHEDULED" | "DIRECT_LINK";
  status: SessionStatusCode;
  title: string | null;
  candidate: { id: string; email: string; name: string | null } | null;
  scheduledAt: string | null;
  durationMinutes: number;
  config: {
    interviewType: InterviewTypeCode | null;
    difficulty: string | null;
    recordVideo: boolean;
    recordAudio: boolean;
    recordScreen: boolean;
    /** Whether the server's media provider can produce a recording at all. The record flags only say it was asked for. */
    recordingAvailable: boolean;
    channels: MonitoringChannel[];
    sensitivity: string;
    configVersion: number;
    needsReconsent: boolean;
  };
  interviewers: { userId: string; name: string; isPrimary: boolean }[];
  jdStatus: string | null;
  tasks: { sessionTaskId: string; taskId: string; title: string; position: number }[];
  reportId: string | null;
  armedAt: string | null;
  admittedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  sealedAt: string | null;
  createdAt: string;
};

export type SessionLink = {
  linkId: string;
  /** Present only for callers allowed to create links, and only while the link is still usable. */
  url: string | null;
  kind: "ONE_TIME" | "REUSABLE";
  notBefore: string | null;
  expiresAt: string;
  usedAt: string | null;
  useCount: number;
  revokedAt: string | null;
  /** Derived when fetched: not revoked, not expired, and (for one-time links) not yet used. */
  active: boolean;
};

export type SessionNote = { id: string; sessionId: string; authorId: string; body: string; ts: string; mediaOffsetMs: number | null };

export type CreatedLink = { linkId: string; url: string; kind: string; expiresAt: string };

// ---- display helpers -------------------------------------------------------------------------

/** Short, human-friendly reference for a session: the random tail of its ULID (e.g. "8F7K2M"). */
export function sessionRef(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function sessionRole(s: ApiSession): string {
  return s.title?.trim() || "Untitled interview";
}

export function sessionCandidateName(s: ApiSession): string {
  return s.candidate?.name?.trim() || s.candidate?.email || "No candidate";
}

export function primaryInterviewerName(s: ApiSession): string {
  return s.interviewers.find((i) => i.isPrimary)?.name ?? s.interviewers[0]?.name ?? "Unassigned";
}

export function sessionStart(s: ApiSession): Date | null {
  const iso = s.startedAt ?? s.scheduledAt;
  return iso ? new Date(iso) : null;
}

export function sessionUiStatus(s: ApiSession) {
  return sessionStatusLabel(s.status);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the viewer's local timezone (what a person means by "the 17th"). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combines the `<input type=date>` and `<input type=time>` values (local) into an ISO timestamp. */
export function toIsoFromLocal(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}


// ---- API calls -------------------------------------------------------------------------------

const MAX_PAGES = 10;

/** All sessions in the org (newest first). The views filter and group client-side. */
export async function listAllSessions(): Promise<{ items: ApiSession[]; truncated: boolean }> {
  const items: ApiSession[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, meta } = await apiRequestPage<ApiSession[], { nextCursor: string | null }>(
      `/sessions?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...data);
    if (!meta.nextCursor) return { items, truncated: false };
    cursor = meta.nextCursor;
  }
  return { items, truncated: true };
}

export function getSession(id: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/sessions/${encodeURIComponent(id)}`);
}

export type CreateSessionInput = {
  mode: "SCHEDULED" | "DIRECT_LINK";
  title?: string;
  candidateEmail?: string;
  candidateName?: string;
  scheduledAt?: string;
  durationMinutes: number;
};

export function createSession(input: CreateSessionInput): Promise<ApiSession> {
  return apiRequest<ApiSession>("/sessions", { method: "POST", body: input });
}

export type UpdateSessionInput = Partial<{
  title: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  /** Assigns (or replaces) the candidate; links issued for the previous candidate are revoked by the server. */
  candidateEmail: string;
  candidateName: string | null;
}>;

export function updateSession(id: string, patch: UpdateSessionInput): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
}

export type SessionConfigPatch = Partial<{
  interviewType: InterviewTypeCode;
  recordVideo: boolean;
  recordAudio: boolean;
  recordScreen: boolean;
  channels: MonitoringChannel[];
  taskIds: string[];
}>;

export function patchSessionConfig(id: string, patch: SessionConfigPatch): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/sessions/${encodeURIComponent(id)}/config`, { method: "PATCH", body: patch });
}

export function cancelSession(id: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/sessions/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export function addSessionInterviewer(id: string, userId: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/sessions/${encodeURIComponent(id)}/interviewers`, { method: "POST", body: { userId } });
}

export function createSessionLink(id: string, input: { kind: "ONE_TIME" | "REUSABLE"; expiresAt: string; sendInvite: boolean }): Promise<CreatedLink> {
  return apiRequest<CreatedLink>(`/sessions/${encodeURIComponent(id)}/links`, { method: "POST", body: input });
}

export async function listSessionLinks(id: string): Promise<SessionLink[]> {
  const { data } = await apiRequestPage<Omit<SessionLink, "active">[], unknown>(`/sessions/${encodeURIComponent(id)}/links`);
  const now = Date.now();
  return data.map((l) => ({
    ...l,
    active: !l.revokedAt && new Date(l.expiresAt).getTime() > now && !(l.kind === "ONE_TIME" && l.usedAt),
  }));
}

export function revokeSessionLink(id: string, linkId: string): Promise<void> {
  return apiRequest<void>(`/sessions/${encodeURIComponent(id)}/links/${encodeURIComponent(linkId)}/revoke`, { method: "POST" });
}

export function listSessionNotes(id: string): Promise<SessionNote[]> {
  return apiRequest<SessionNote[]>(`/sessions/${encodeURIComponent(id)}/notes`);
}

export function addSessionNote(id: string, body: string): Promise<SessionNote> {
  return apiRequest<SessionNote>(`/sessions/${encodeURIComponent(id)}/notes`, { method: "POST", body: { body } });
}
