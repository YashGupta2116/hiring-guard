"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { VideoPanel } from "@/components/live-interview/video-panel";
import { LiveSidebar } from "@/components/live-interview/live-sidebar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SessionPill } from "@/components/ui/session-pill";
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
  ChevronLeft,
  MoreVertical,
  MoreHorizontal,
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

  const [secondsElapsed, setSecondsElapsed] = useState(2058);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
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
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden animate-fade-in-up">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background shrink-0">
            <Radio className="h-4 w-4" />
          </div>

          <Link
            href={`/app/interviews/${interview.id}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="h-4 w-4" /> Exit Interview
          </Link>

          <SessionPill status="Live" size="sm" />

          <div className="hidden sm:block ml-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight truncate">
              {interview.candidateName}
            </h1>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {interview.jobRole} • Senior Level • Interview ID #{interview.token}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 font-mono text-sm font-semibold text-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatTimer(secondsElapsed)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>Encrypted Recording</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyLink}
            className="h-9 text-xs gap-1.5 px-3 rounded-lg"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Candidate Link
          </Button>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
            title="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Command Center */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Left: Video (full height, no code editor) */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
          <VideoPanel
            candidateName={interview.candidateName}
            candidateAvatar={interview.candidateAvatar}
            interviewerName={currentUser.name}
            isMicMuted={isMicMuted}
            isCameraOff={isCameraOff}
          />
        </div>

        {/* Right: Telemetry / Assistant / Transcript / Notes */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <LiveSidebar candidateName={interview.candidateName} />
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <Shield className="h-4 w-4 text-sage-600 dark:text-sage-400 shrink-0" />
          <div className="leading-tight hidden sm:block">
            <p className="text-xs font-medium text-foreground">
              Multimodal Baseline:{" "}
              <span className="text-sage-600 dark:text-sage-400">Consistent</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Video, audio, gaze and environment monitoring active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
          <button
            onClick={() => setIsMicMuted(!isMicMuted)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              isMicMuted
                ? "bg-red-500/10 border-red-500/30 text-red-600"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setIsCameraOff(!isCameraOff)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              isCameraOff
                ? "bg-red-500/10 border-red-500/30 text-red-600"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title={isCameraOff ? "Turn On Camera" : "Turn Off Camera"}
          >
            {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          </button>

          <button
            onClick={() => {
              setIsScreenSharing(!isScreenSharing);
              toast({
                title: isScreenSharing ? "Screen Share Stopped" : "Screen Share Active",
                description: isScreenSharing
                  ? "Broadcasting camera feed"
                  : "Broadcasting interviewer display",
                type: "info",
              });
            }}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              isScreenSharing
                ? "bg-foreground text-background"
                : "bg-secondary border-border text-foreground hover:bg-secondary/80"
            )}
            title="Share Screen"
          >
            <ScreenShare className="h-4 w-4" />
          </button>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            title="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          <Button
            variant="destructive"
            onClick={() => setEndSessionDialogOpen(true)}
            className="h-10 px-4 text-sm gap-2 ml-1 rounded-full"
          >
            <PhoneOff className="h-4 w-4" /> End Interview
          </Button>
        </div>

        <div className="text-xs text-muted-foreground hidden md:block text-right leading-tight shrink-0">
          <p>Session #{interview.token}</p>
          <p className="text-[11px]">Started at 2:30 PM</p>
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
            Ending the session will terminate feeds, snapshot the candidate&apos;s code AST, and
            synthesize multimodal observations into the official Decision Intelligence Report.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1.5 text-muted-foreground">
          <p className="font-semibold text-foreground">Automated Synthesis Steps:</p>
          <p>• Transcribe audio and match against rubric criteria</p>
          <p>• Correlate keystroke dynamics with gaze vectors</p>
          <p>• Synthesize Integrity Confidence Score & Anomaly Timeline</p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setEndSessionDialogOpen(false)}>
            Continue Interview
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEndInterview}>
            Confirm & Synthesize
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}