"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { VideoPanel } from "@/components/live-interview/video-panel";
import { CodeEditorPanel } from "@/components/live-interview/code-editor-panel";
import { LiveSidebar } from "@/components/live-interview/live-sidebar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SessionPill } from "@/components/ui/session-pill";
import { CandidateWarning } from "@/components/ui/candidate-warning";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Radio,
  Clock,
  Shield,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function LiveInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getInterviewById, currentUser } = useStore();
  const { toast } = useToast();

  const interview = getInterviewById(id);

  // Timer state (seconds)
  const [secondsElapsed, setSecondsElapsed] = useState(2058); // default to ~34 mins in
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [endSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs > 0 ? `${hrs.toString().padStart(2, "0")}:` : ""}${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyLink = () => {
    if (!interview) return;
    navigator.clipboard.writeText(interview.candidateLink);
    setCopiedLink(true);
    toast({
      title: "Candidate link copied",
      description: "Candidate invitation link is in your clipboard.",
      type: "success",
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleEndInterview = () => {
    setEndSessionDialogOpen(false);
    toast({
      title: "Session Finished",
      description: "Synthesizing multimodal telemetry and generating decision report...",
      type: "info",
    });
    router.push(`/app/interviews/${interview?.id || id}/processing`);
  };

  if (!interview) {
    return (
      <EmptyState
        icon={Radio}
        title="Live Interview Session Not Found"
        description="The live room could not be loaded from this session token."
        actionLabel="Return to Interviews"
        onAction={() => router.push("/app/interviews")}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] -m-4 sm:-m-6 md:-m-8 bg-background overflow-hidden animate-fade-in-up">
      {/* Top Bar: Room Title, Timer, Recording, Status */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/app/interviews/${interview.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <ChevronLeft className="h-4 w-4" /> Exit
          </Link>

          <SessionPill status="Live" size="sm" />

          <div className="hidden sm:block">
            <h1 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="font-serif">{interview.candidateName}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground text-xs font-normal">
                {interview.jobRole}
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Timer & Recording */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{formatTimer(secondsElapsed)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded border border-border bg-secondary/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-terra-500" />
            <span>Encrypted Recording</span>
          </div>
        </div>

        {/* Right: Candidate Link Copy & Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyLink}
            className="h-7 text-xs gap-1 px-2.5"
            title="Copy Candidate Invitation Link"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">Candidate Link</span>
          </Button>

          <Link href={`/interview/${interview.token}`} target="_blank">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Open Candidate View in New Tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Command Center: Left (Video + Monaco Editor) & Right (Live AI Sidebar) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2.5 p-2.5 overflow-hidden">
        {/* Left 8 Columns: Video Feed & Code Editor */}
        <div className="lg:col-span-8 flex flex-col gap-2.5 h-full overflow-hidden">
          {/* Candidate Webcam Feed */}
          <div className="shrink-0">
            <VideoPanel
              candidateName={interview.candidateName}
              candidateAvatar={interview.candidateAvatar}
              interviewerName={currentUser.name}
              interviewerAvatar={currentUser.avatar}
            />
          </div>

          {/* Monaco Code Editor */}
          <div className="flex-1 min-h-0">
            <CodeEditorPanel
              initialCode={interview.codingRoundConfig?.starterCode}
              initialLanguage={interview.codingRoundConfig?.language || "typescript"}
            />
          </div>
        </div>

        {/* Right 4 Columns: Multimodal Telemetry & Contextual AI Assistant */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <LiveSidebar candidateName={interview.candidateName} />
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-card shrink-0">
        <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" />
          <span>Multimodal Baseline: <strong className="text-foreground">Consistent</strong></span>
        </div>

        {/* Call Controls */}
        <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
          {/* Mic */}
          <button
            onClick={() => setIsMicMuted(!isMicMuted)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              isMicMuted
                ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          {/* Camera */}
          <button
            onClick={() => setIsCameraOff(!isCameraOff)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              isCameraOff
                ? "bg-terra-500/10 border-terra-500/30 text-terra-600 dark:text-terra-400"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title={isCameraOff ? "Turn On Camera" : "Turn Off Camera"}
          >
            {isCameraOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={() => {
              setIsScreenSharing(!isScreenSharing);
              toast({
                title: isScreenSharing ? "Screen Share Stopped" : "Screen Share Active",
                description: isScreenSharing ? "Broadcasting camera feed" : "Broadcasting interviewer display",
                type: "info",
              });
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              isScreenSharing
                ? "bg-foreground text-background"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title="Share Screen"
          >
            <ScreenShare className="h-3.5 w-3.5" />
          </button>

          {/* End Interview */}
          <Button
            variant="destructive"
            onClick={() => setEndSessionDialogOpen(true)}
            className="h-8 px-3 text-xs gap-1.5 ml-1"
          >
            <PhoneOff className="h-3.5 w-3.5" /> End Interview
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground hidden md:block font-mono">
          Session #{interview.token}
        </div>
      </div>

      {/* End Interview Confirmation Modal */}
      <Dialog open={endSessionDialogOpen} onOpenChange={setEndSessionDialogOpen}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-terra-600 dark:text-terra-400">
            <PhoneOff className="h-4 w-4" />
            <DialogTitle>End Live Technical Session?</DialogTitle>
          </div>
          <DialogDescription>
            Ending the session will terminate feeds, snapshot the candidate's code AST, and synthesize multimodal observations into the official Decision Intelligence Report.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1.5 text-muted-foreground">
          <p className="font-semibold text-foreground">
            Automated Synthesis Steps:
          </p>
          <p>• Transcribe audio and match against rubric criteria</p>
          <p>• Correlate keystroke dynamics with gaze vectors</p>
          <p>• Synthesize Integrity Confidence Score & Anomaly Timeline</p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEndSessionDialogOpen(false)}
          >
            Continue Interview
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndInterview}
          >
            Confirm & Synthesize
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
