import { ulid } from "ulid";

export function newSessionId(): string {
  return `ses_${ulid()}`;
}

export function newRequestId(): string {
  return ulid();
}
