export type UserRole = "Admin" | "Interviewer" | "Viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  title: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  appliedRole: string;
  experienceYears: number;
  location: string;
  interviewsTaken: number;
  lastInterviewDate: string;
  averageScore: number;
  status: "Under Review" | "Shortlisted" | "Rejected" | "Hired" | "Interviewing";
  bio: string;
  skills: string[];
  strengths: string[];
  weaknesses: string[];
  notes: string;
  radarScores: {
    skill: string;
    score: number;
    benchmark: number;
  }[];
}

export type InterviewStatus = "Draft" | "Scheduled" | "Live" | "Completed" | "Cancelled";
export type InterviewType = "Frontend Architecture" | "Distributed Systems" | "Full Stack Coding" | "Algorithms & Data Structures" | "Backend Engineering";

export interface Interview {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateAvatar: string;
  jobRole: string;
  interviewType: InterviewType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMinutes: number;
  status: InterviewStatus;
  interviewerId: string;
  interviewerName: string;
  interviewerAvatar: string;
  token: string; // Candidate access token e.g. 8F7K2M
  tokenExpiresAt: string;
  candidateLink: string;
  codingRoundConfig?: {
    language: string;
    starterCode: string;
    questionId: string;
    allowedLanguages: string[];
  };
  monitoringConfig: {
    webcamRequired: boolean;
    screenShareRequired: boolean;
    clipboardTracking: boolean;
    gazeTelemetry: boolean;
    audioAnalysis: boolean;
  };
  recordingEnabled: boolean;
  notes?: string;
  timeline: {
    stage:
      | "Created"
      | "Scheduled"
      | "Reminder Sent"
      | "Upcoming"
      | "Candidate Joined"
      | "Interview Started"
      | "Interview Completed"
      | "Report Generated";
    timestamp: string;
    description: string;
  }[];
  reportId?: string;
}

export type IntegritySeverity = "Info" | "Low" | "Medium" | "High";

export type IntegrityEventType =
  | "Tab switch"
  | "Window blur"
  | "Window focus"
  | "Copy"
  | "Paste"
  | "Large code insertion"
  | "Long inactivity"
  | "Gaze deviation"
  | "Face missing"
  | "Secondary object detected"
  | "Unusual latency"
  | "Code execution"
  | "Question change";

export interface IntegrityEvent {
  id: string;
  timestamp: string; // "00:08:31"
  timestampSeconds: number;
  type: IntegrityEventType;
  severity: IntegritySeverity;
  title: string;
  description: string;
  correlatedGroupId?: string;
  contextData?: {
    charactersInserted?: number;
    gazeAngle?: string;
    gazeDurationSeconds?: number;
    latencyMs?: number;
    codeSnippet?: string;
  };
}

export interface QuestionEvaluation {
  id: string;
  questionId: string;
  questionTitle: string;
  candidateAnswerSummary: string;
  expectedReasoning: string;
  aiEvaluation: string;
  score: number; // 0 - 100
  timeSpentMinutes: number;
  codeQualityRating: "Poor" | "Adequate" | "Good" | "Exceptional";
}

export interface Report {
  id: string;
  interviewId: string;
  candidateId: string;
  candidateName: string;
  candidateAvatar: string;
  appliedRole: string;
  interviewDate: string;
  interviewerName: string;
  status: "Ready" | "Pending Review" | "Approved";

  // High-level scores
  overallScore: number; // 0 - 100
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  integrityConfidenceScore: number; // 0 - 100

  // Integrity summary & explanation
  integrityBand: "High Confidence" | "Moderate Variance" | "Review Recommended";
  integrityExplanation: string;
  correlatedAnomaliesCount: number;

  aiSummary: string;
  keyStrengths: string[];
  areasForImprovement: string[];
  recommendation: "Strong Hire" | "Hire" | "Leaning Hire" | "Needs Further Review" | "No Hire";
  recommendationReasoning: string;

  questionEvaluations: QuestionEvaluation[];
  integrityEvidence: IntegrityEvent[];
  interviewerNotes?: string;
}

export interface Question {
  id: string;
  title: string;
  category: "Coding" | "System Design" | "Behavioral";
  difficulty: "Easy" | "Medium" | "Hard";
  skills: string[];
  expectedTimeMinutes: number;
  tags: string[];
  description: string;
  starterCode?: Record<string, string>;
  testCases?: {
    input: string;
    expectedOutput: string;
    description: string;
  }[];
  evaluationRubric: string[];
}
