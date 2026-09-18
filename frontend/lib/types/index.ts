/** The three permission levels the UI gates on; backend roles collapse onto these (see `toUiRole`). */
export type UserRole = "Admin" | "Interviewer" | "Viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  title: string;
}

/** The five labels the UI shows for the backend's session statuses (see `sessionStatusLabel`). */
export type InterviewStatus = "Draft" | "Scheduled" | "Live" | "Completed" | "Cancelled";
