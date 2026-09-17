"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Candidate, Interview, Question, Report, User } from "../types";
import { MOCK_CANDIDATES } from "../mock-data/candidates";
import { MOCK_INTERVIEWS } from "../mock-data/interviews";
import { MOCK_QUESTIONS } from "../mock-data/questions";
import { MOCK_REPORTS } from "../mock-data/reports";
import { CURRENT_USER_DEFAULT, MOCK_USERS } from "../mock-data/users";

interface StoreContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  interviews: Interview[];
  candidates: Candidate[];
  reports: Report[];
  questions: Question[];
  addInterview: (interview: Interview) => void;
  updateInterview: (id: string, updates: Partial<Interview>) => void;
  cancelInterview: (id: string) => void;
  addCandidate: (candidate: Candidate) => void;
  updateCandidate: (id: string, updates: Partial<Candidate>) => void;
  addReport: (report: Report) => void;
  addQuestion: (question: Question) => void;
  deleteQuestion: (id: string) => void;
  resetDemoData: () => void;
  getInterviewById: (id: string) => Interview | undefined;
  getInterviewByToken: (token: string) => Interview | undefined;
  getCandidateById: (id: string) => Candidate | undefined;
  getReportById: (id: string) => Report | undefined;
}

const StoreContext = createContext<StoreContextType | null>(null);

const STORAGE_KEY_PREFIX = "veritrust_state_";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User>(CURRENT_USER_DEFAULT);
  const [interviews, setInterviews] = useState<Interview[]>(MOCK_INTERVIEWS);
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [reports, setReports] = useState<Report[]>(MOCK_REPORTS);
  const [questions, setQuestions] = useState<Question[]>(MOCK_QUESTIONS);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage once on client mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_PREFIX + "user");
      if (savedUser) setCurrentUserState(JSON.parse(savedUser));

      const savedInterviews = localStorage.getItem(STORAGE_KEY_PREFIX + "interviews");
      if (savedInterviews) setInterviews(JSON.parse(savedInterviews));

      const savedCandidates = localStorage.getItem(STORAGE_KEY_PREFIX + "candidates");
      if (savedCandidates) setCandidates(JSON.parse(savedCandidates));

      const savedReports = localStorage.getItem(STORAGE_KEY_PREFIX + "reports");
      if (savedReports) setReports(JSON.parse(savedReports));

      const savedQuestions = localStorage.getItem(STORAGE_KEY_PREFIX + "questions");
      if (savedQuestions) setQuestions(JSON.parse(savedQuestions));
    } catch (e) {
      console.error("Failed to hydrate store from localStorage", e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save to localStorage when state changes after initial hydration
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + "user", JSON.stringify(currentUser));
      localStorage.setItem(STORAGE_KEY_PREFIX + "interviews", JSON.stringify(interviews));
      localStorage.setItem(STORAGE_KEY_PREFIX + "candidates", JSON.stringify(candidates));
      localStorage.setItem(STORAGE_KEY_PREFIX + "reports", JSON.stringify(reports));
      localStorage.setItem(STORAGE_KEY_PREFIX + "questions", JSON.stringify(questions));
    } catch (e) {
      console.error("Failed to persist store to localStorage", e);
    }
  }, [currentUser, interviews, candidates, reports, questions, isHydrated]);

  const setCurrentUser = (user: User) => {
    setCurrentUserState(user);
  };

  const addInterview = (interview: Interview) => {
    setInterviews((prev) => [interview, ...prev]);
  };

  const updateInterview = (id: string, updates: Partial<Interview>) => {
    setInterviews((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const cancelInterview = (id: string) => {
    setInterviews((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "Cancelled" as const } : item
      )
    );
  };

  const addCandidate = (candidate: Candidate) => {
    setCandidates((prev) => [candidate, ...prev]);
  };

  const updateCandidate = (id: string, updates: Partial<Candidate>) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const addReport = (report: Report) => {
    setReports((prev) => [report, ...prev]);
  };

  const addQuestion = (question: Question) => {
    setQuestions((prev) => [question, ...prev]);
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const resetDemoData = () => {
    setCurrentUserState(CURRENT_USER_DEFAULT);
    setInterviews(MOCK_INTERVIEWS);
    setCandidates(MOCK_CANDIDATES);
    setReports(MOCK_REPORTS);
    setQuestions(MOCK_QUESTIONS);
    try {
      localStorage.removeItem(STORAGE_KEY_PREFIX + "user");
      localStorage.removeItem(STORAGE_KEY_PREFIX + "interviews");
      localStorage.removeItem(STORAGE_KEY_PREFIX + "candidates");
      localStorage.removeItem(STORAGE_KEY_PREFIX + "reports");
      localStorage.removeItem(STORAGE_KEY_PREFIX + "questions");
    } catch (e) {
      console.error(e);
    }
  };

  const getInterviewById = (id: string) => {
    return interviews.find((i) => i.id === id);
  };

  const getInterviewByToken = (token: string) => {
    return interviews.find((i) => i.token.toLowerCase() === token.toLowerCase());
  };

  const getCandidateById = (id: string) => {
    return candidates.find((c) => c.id === id);
  };

  const getReportById = (id: string) => {
    return reports.find((r) => r.id === id);
  };

  return (
    <StoreContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users: MOCK_USERS,
        interviews,
        candidates,
        reports,
        questions,
        addInterview,
        updateInterview,
        cancelInterview,
        addCandidate,
        updateCandidate,
        addReport,
        addQuestion,
        deleteQuestion,
        resetDemoData,
        getInterviewById,
        getInterviewByToken,
        getCandidateById,
        getReportById,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
