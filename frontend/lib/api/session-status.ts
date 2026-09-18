import type { InterviewStatus } from "@/lib/types";

/** Backend `SessionStatus` values collapse onto the five labels the UI has always used. */
export function sessionStatusLabel(status: string): InterviewStatus {
  switch (status) {
    case "DRAFT":
    case "CONFIGURED":
      return "Draft";
    case "ARMED":
    case "ADMITTED":
      return "Scheduled";
    case "LIVE":
      return "Live";
    case "SEALING":
    case "PROCESSING":
    case "COMPLETE":
      return "Completed";
    default:
      // ABORTED, EXPIRED
      return "Cancelled";
  }
}
