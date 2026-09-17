"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store/interview-store";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateWarning } from "@/components/ui/candidate-warning";
import {
  Shield,
  Clock,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Play,
  HelpCircle,
  Code,
  Terminal,
  Send,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function CandidateInterviewPage() {
  const params = useParams();
  const token = params.token as string;
  const { getInterviewByToken } = useStore();
  const { toast } = useToast();

  const interview = getInterviewByToken(token);

  const [seconds, setSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [language, setLanguage] = useState(
    interview?.codingRoundConfig?.language || "typescript"
  );
  const [code, setCode] = useState(
    interview?.codingRoundConfig?.starterCode ||
      `// Write your solution here\nfunction solution() {\n  // Code\n}`
  );
  const [isRunning, setIsRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRun = () => {
    setIsRunning(true);
    setTestOutput(["Running test assertions..."]);
    setTimeout(() => {
      setIsRunning(false);
      setTestOutput([
        "Test Case 1 Passed (3ms)",
        "Test Case 2 Passed (4ms)",
        "Memory allocated: 1.8 MB",
        "All test assertions passed successfully.",
      ]);
      toast({
        title: "Code Executed",
        description: "Your solution passed local test assertions.",
        type: "success",
      });
    }, 800);
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    toast({
      title: "Solution Submitted",
      description: "Your code milestone has been submitted to the interviewer.",
      type: "success",
    });
  };

  if (!interview) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <EmptyState
          icon={Shield}
          title="Interview Session Invalid or Expired"
          description={`No active interview session found for token "${token}". Please check your invitation email link.`}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Bar for Candidate: Neutral & Trustworthy */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background font-bold">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>Technical Interview Session</span>
              <span className="text-xs text-muted-foreground font-normal">
                ({interview.jobRole})
              </span>
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Candidate: <strong>{interview.candidateName}</strong> • Room #{token}
            </p>
          </div>
        </div>

        {/* Center: Timer & Recording Advisory */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{formatTimer(seconds)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-terra-500" />
            <span>Session Recorded</span>
          </div>
        </div>

        {/* Right: Submit Button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitted}
            className="h-7.5 gap-1.5 text-xs"
          >
            <Send className="h-3 w-3" />
            {isSubmitted ? "Submitted ✓" : "Submit Code"}
          </Button>
        </div>
      </header>

      {/* Main Sandbox Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2.5 p-2.5 overflow-hidden">
        {/* Left 4 Columns: Problem Statement & Webcam Feeds */}
        <div className="lg:col-span-4 flex flex-col gap-2.5 h-full overflow-hidden">
          {/* Webcam Feeds: Interviewer Video + Candidate Preview */}
          <div className="grid grid-cols-2 gap-2 h-32 shrink-0">
            {/* Interviewer Stream */}
            <div className="relative rounded-lg border border-border bg-slate-950 overflow-hidden flex items-center justify-center">
              <img
                src={interview.interviewerAvatar}
                alt={interview.interviewerName}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">
                {interview.interviewerName.split(" ")[0]} (Interviewer)
              </div>
            </div>

            {/* Candidate Own Camera */}
            <div className="relative rounded-lg border border-border bg-slate-950 overflow-hidden flex items-center justify-center">
              {!isCameraOff ? (
                <img
                  src={interview.candidateAvatar}
                  alt="You"
                  className="w-full h-full object-cover"
                />
              ) : (
                <VideoOff className="h-5 w-5 text-slate-500" />
              )}
              <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">
                You
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                {isMicMuted && <MicOff className="h-2.5 w-2.5 text-terra-400 bg-sand-950/70 p-0.5 rounded" />}
              </div>
            </div>
          </div>

          {/* Problem Statement Card */}
          <div className="flex-1 rounded-lg border border-border bg-card p-3.5 overflow-y-auto space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border">
              <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <HelpCircle className="h-3.5 w-3.5" /> Technical Problem
              </span>
              <Badge variant="outline" size="sm" className="text-[10px]">
                Medium
              </Badge>
            </div>

            <div>
              <h3 className="font-semibold text-xs text-foreground">
                High-Frequency Telemetry Ring Buffer
              </h3>
              <p className="mt-1 text-muted-foreground text-[11px] leading-relaxed">
                Design and implement a fixed-capacity circular ring buffer capable of receiving rapid telemetry packets without generating garbage collection overhead.
              </p>
            </div>

            <div className="space-y-1 pt-1">
              <h4 className="font-semibold text-foreground text-[11px]">Requirements & Constraints:</h4>
              <ul className="list-disc pl-3.5 space-y-1 text-muted-foreground text-[11px]">
                <li><code className="bg-secondary px-1 rounded">push(packet)</code> must operate in strict O(1) time complexity.</li>
                <li>When the buffer reaches maximum capacity, overwrite the oldest packet.</li>
                <li><code className="bg-secondary px-1 rounded">getSnapshot()</code> should return items in chronological order.</li>
                <li>Ensure pointer wraparounds behave correctly using modulo arithmetic.</li>
              </ul>
            </div>

            {/* Candidate Advisory Notice (PDF Page 3) */}
            <div className="pt-2">
              <CandidateWarning
                tier="NOTICE"
                message="Please keep your face within the camera frame."
              />
            </div>
          </div>
        </div>

        {/* Right 8 Columns: Candidate Monaco Code Editor & Test Console */}
        <div className="lg:col-span-8 flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
          {/* Editor Header */}
          <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border bg-secondary/30 text-xs">
            <div className="flex items-center gap-2">
              <Code className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground text-xs">Solution Editor</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleRun}
                isLoading={isRunning}
                className="h-6.5 px-3 text-xs"
              >
                <Play className="h-3 w-3 mr-1 fill-current" /> Run Code
              </Button>
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-[260px] bg-[#18181b]">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(val) => setCode(val || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            />
          </div>

          {/* Bottom Test Output */}
          <div className="h-32 border-t border-border bg-card p-2.5 font-mono text-xs overflow-y-auto space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground pb-1 flex items-center gap-1.5">
              <Terminal className="h-3 w-3" /> Test Execution Output:
            </div>
            {testOutput.length === 0 ? (
              <span className="text-muted-foreground text-[11px] italic">
                Press "Run Code" to compile and execute test assertions.
              </span>
            ) : (
              testOutput.map((line, i) => (
                <div key={i} className="text-foreground text-[11px]">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Candidate Bottom Controls */}
      <footer className="flex items-center justify-between px-5 py-2 border-t border-border bg-card">
        <div className="text-xs text-muted-foreground">
          VeriTrust Candidate Assessment Environment
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMicMuted(!isMicMuted)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              isMicMuted
                ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title="Toggle Mic"
          >
            {isMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => setIsCameraOff(!isCameraOff)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              isCameraOff
                ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title="Toggle Camera"
          >
            {isCameraOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          Token: <span className="text-foreground font-semibold">{token}</span>
        </div>
      </footer>
    </div>
  );
}
