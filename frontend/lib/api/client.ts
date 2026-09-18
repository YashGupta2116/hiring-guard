/**
 * Thin fetch wrapper for the VeriTrust backend (`/api/v1`).
 *
 * - The access token lives in memory only; the refresh token is an httpOnly cookie (`vt_rt`)
 *   the browser sends automatically because every call uses `credentials: "include"`.
 * - A 401 on an authenticated call triggers exactly one refresh + retry. Refreshes are
 *   de-duplicated: the backend rotates refresh tokens and treats reuse as theft, so two
 *   concurrent refreshes would revoke the whole session family.
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9000/api/v1").replace(/\/$/, "");

export type ApiFieldError = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiFieldError[];

  constructor(status: number, code: string, message: string, fields: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** The auth provider registers this so a failed refresh can drop the user back to /login. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

type RawResponse = { status: number; body: unknown };

async function send(path: string, init: RequestInit): Promise<RawResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the VeriTrust server. Check that the backend is running.");
  }
  const text = res.status === 204 ? "" : await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: res.status, body };
}

function toApiError(raw: RawResponse): ApiError {
  const err = (raw.body as { error?: { code?: string; message?: string; details?: { fields?: ApiFieldError[] } } } | null)?.error;
  return new ApiError(raw.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${raw.status}).`, err?.details?.fields ?? []);
}

/** Exchanges the refresh cookie for a new access token. Returns null when there is no valid session. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const raw = await send("/auth/refresh", { method: "POST" });
        if (raw.status !== 200) {
          accessToken = null;
          return null;
        }
        accessToken = (raw.body as { data: { accessToken: string } }).data.accessToken;
        return accessToken;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for public endpoints (login/register) so a 401 is not treated as an expired session. */
  auth?: boolean;
  /**
   * Use this token instead of the signed-in user's access token (e.g. the candidate token). A request
   * with a bearer never triggers the interviewer refresh flow or the session-expired handler.
   */
  bearer?: string;
};

async function execute(path: string, options: RequestOptions): Promise<RawResponse> {
  const { method = "GET", body, bearer } = options;
  const auth = bearer ? false : (options.auth ?? true);

  const attempt = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return send(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  };

  let raw = await attempt();

  if (raw.status === 401 && auth) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      raw = await attempt();
    } else {
      onSessionExpired?.();
    }
  }

  if (raw.status >= 400) throw toApiError(raw);
  return raw;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const raw = await execute(path, options);
  if (raw.status === 204) return undefined as T;
  return (raw.body as { data: T }).data;
}

/** For list endpoints that answer `{ data, meta }` (cursor pagination). */
export async function apiRequestPage<T, M>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta: M }> {
  const raw = await execute(path, options);
  return raw.body as { data: T; meta: M };
}
