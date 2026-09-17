import { User } from "../types";

export const MOCK_USERS: User[] = [
  {
    id: "usr-admin-1",
    name: "Dr. Elena Vance",
    email: "elena.vance@veritrust.ai",
    role: "Admin",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    title: "Head of Engineering & Admin",
  },
  {
    id: "usr-interviewer-1",
    name: "Marcus Sterling",
    email: "marcus.s@veritrust.ai",
    role: "Interviewer",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    title: "Principal Staff Engineer & Lead Interviewer",
  },
  {
    id: "usr-viewer-1",
    name: "Sarah Lin",
    email: "sarah.lin@veritrust.ai",
    role: "Viewer",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
    title: "Senior Talent Partner (Read-Only)",
  },
];

export const CURRENT_USER_DEFAULT = MOCK_USERS[1]; // Default to Interviewer Marcus Sterling, but easily switchable
