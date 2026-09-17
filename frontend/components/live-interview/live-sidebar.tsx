"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Shield,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  User,
  Bot,
  Radio,
  Clock,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";
import { cn } from "@/lib/utils";

interface LiveSidebarProps {
  candidateName: string;
  onSendQuestionToCandidate?: (questionText: string) => void;
}

export function LiveSidebar({
  candidateName,
  onSendQuestionToCandidate,
}: LiveSidebarProps) {
  const [activeTab, setActiveTab] = useState<
    "telemetry" | "assistant" | "transcript" | "notes"
  >("telemetry");

  const [notes, setNotes] = useState(
    "Candidate quickly recognized the circular index calculation modulo capacity. Communicating clearly with positive posture."
  );

  const [newNote, setNewNote] = useState("");

  const contextualPrompts = [
    {
      id: "cp-1",
      type: "Suggested follow-up",
      prompt: "Ask the candidate to explain the time complexity of the modulo pointer calculation vs bitwise masking.",
      priority: "High",
    },
    {
      id: "cp-2",
      type: "Follow-up",
      prompt: "Change the constraint to power-of-two capacity and ask them to optimize using (head + 1) & (capacity - 1).",
      priority: "Medium",
    },
    {
      id: "cp-3",
      type: "Signal",
      prompt: "Response latency increased by 1400ms following requirement adjustment, followed by structured code refinement.",
      priority: "Info",
    },
    {
      id: "cp-4",
      type: "Follow-up",
      prompt: "Ask how this implementation behaves if multiple consumer worker threads read getSnapshot() concurrently.",
      priority: "Medium",
    },
  ];

  const telemetrySignals = [
    {
      id: "sig-1",
      time: "11:34:12",
      status: "good",
      label: "Gaze telemetry calibrated and centered",
    },
    {
      id: "sig-2",
      time: "11:35:40",
      status: "good",
      label: "Keystroke rhythm organic (mean flight time: 142ms)",
    },
    {
      id: "sig-3",
      time: "11:37:15",
      status: "warn",
      label: "Off-screen gaze deviation (3.8s) towards secondary display",
    },
    {
      id: "sig-4",
      time: "11:37:20",
      status: "warn",
      label: "Code insertion burst: 120 chars in 180ms",
    },
    {
      id: "sig-5",
      time: "11:38:02",
      status: "good",
      label: "Vocal response resumed with immediate explanation",
    },
  ];

  const liveTranscript = [
    {
      speaker: "Interviewer",
      time: "11:30",
      text: "Welcome Maya! Let's examine the high-frequency telemetry ring buffer question. Could you start by walking through your mental model?",
    },
    {
      speaker: candidateName,
      time: "11:31",
      text: "Thanks Marcus. Because we are receiving hundreds of telemetry ticks every second, standard array unshift/splice is O(N) and would trigger heavy GC pauses. A fixed circular buffer with modulo head pointers gives true O(1) appends.",
    },
    {
      speaker: "VeriTrust Telemetry",
      time: "11:32",
      text: "Observation: Candidate demonstrated immediate recognition of GC pressure and O(N) array reallocation bottlenecks.",
      isAi: true,
    },
    {
      speaker: "Interviewer",
      time: "11:33",
      text: "Great observation. Go ahead and sketch out the class interface.",
    },
    {
      speaker: candidateName,
      time: "11:34",
      text: "Sure! I'll define TelemetryPacket and set up constructor with capacity and head pointer.",
    },
  ];

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNotes((prev) => `${prev}\n[${new Date().toLocaleTimeString()}] ${newNote}`);
    setNewNote("");
  };

  return (
    <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
      {/* Sidebar Tabs */}
      <div className="flex items-center border-b border-border bg-secondary/30 p-1 text-xs">
        <button
          onClick={() => setActiveTab("telemetry")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-medium transition-colors",
            activeTab === "telemetry"
              ? "bg-card text-foreground font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Shield className="h-3 w-3" />
          <span>Telemetry</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </button>

        <button
          onClick={() => setActiveTab("assistant")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-medium transition-colors",
            activeTab === "assistant"
              ? "bg-card text-foreground font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bot className="h-3 w-3" />
          <span>Assistant</span>
        </button>

        <button
          onClick={() => setActiveTab("transcript")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-medium transition-colors",
            activeTab === "transcript"
              ? "bg-card text-foreground font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="h-3 w-3" />
          <span>Transcript</span>
        </button>

        <button
          onClick={() => setActiveTab("notes")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-medium transition-colors",
            activeTab === "notes"
              ? "bg-card text-foreground font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-3 w-3" />
          <span>Notes</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Tab 1: Live Telemetry */}
        {activeTab === "telemetry" && (
          <div className="space-y-3 animate-fade-in-up">
            {/* Real-time confidence gauge (Restrained, Analytical) */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Radio className="h-3 w-3 text-emerald-500" /> Baseline Confidence
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Normal Variance
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  84%
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Integrity Confidence Score
                </span>
              </div>

              <div className="w-full bg-secondary rounded-full h-1 mt-1 overflow-hidden">
                <div className="bg-foreground h-1 rounded-full w-[84%]" />
              </div>

              <p className="text-[10px] text-muted-foreground pt-1 leading-relaxed">
                * Real-time cognitive baseline stability. Human review remains sovereign.
              </p>
            </div>

            {/* Observations stream */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">
                  Observations Stream
                </h4>
                <span className="text-[10px] text-muted-foreground font-mono">LIVE FEED</span>
              </div>

              <div className="space-y-1.5">
                {telemetrySignals.map((sig) => (
                  <div
                    key={sig.id}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded border text-xs leading-tight transition-colors",
                      sig.status === "good"
                        ? "border-border/70 bg-card text-foreground"
                        : "border-border bg-secondary/50 text-foreground"
                    )}
                  >
                    {sig.status === "good" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-[11px]">{sig.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {sig.time}
                        </span>
                      </div>
                      {sig.status === "warn" && (
                        <span className="inline-block mt-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          Behavioral anomaly flagged
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Contextual AI Assistant (Section 18) */}
        {activeTab === "assistant" && (
          <div className="space-y-2.5 animate-fade-in-up">
            <div className="text-[11px] text-muted-foreground">
              Contextual suggestions derived from candidate AST and latency patterns:
            </div>

            {contextualPrompts.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {item.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {item.priority}
                  </span>
                </div>
                <p className="text-xs text-foreground font-medium leading-relaxed">
                  "{item.prompt}"
                </p>
                {onSendQuestionToCandidate && (
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => onSendQuestionToCandidate(item.prompt)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-medium underline"
                    >
                      Paste to candidate editor
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Live Audio Transcript Stream */}
        {activeTab === "transcript" && (
          <div className="space-y-2.5 animate-fade-in-up">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Streaming Audio Transcript</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
              </span>
            </div>

            <div className="space-y-2">
              {liveTranscript.map((t, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-2.5 rounded-md border text-xs space-y-1",
                    t.isAi
                      ? "border-border bg-secondary/35 text-foreground"
                      : "border-border/60 bg-card text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                    <span>{t.speaker}</span>
                    <span className="font-mono">{t.time}</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Private Interviewer Notes */}
        {activeTab === "notes" && (
          <div className="space-y-2.5 animate-fade-in-up flex flex-col h-full text-xs">
            <div className="text-[11px] text-muted-foreground">
              Confidential interviewer scratchpad (never exposed to candidate).
            </div>

            <div className="flex-1 min-h-[140px] rounded-md border border-border bg-secondary/20 p-2.5 font-mono text-[11px] text-foreground whitespace-pre-wrap">
              {notes}
            </div>

            <form onSubmit={handleAddNote} className="flex gap-1.5">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add confidential note..."
                className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <Button type="submit" size="sm" className="h-7 px-2.5 text-xs">
                Add
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
