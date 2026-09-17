"use client";

import React, { useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, Eye, Radio, Volume2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { StatusBadge } from "../ui/status-badge";
import { CandidateAvatar } from "../ui/candidate-avatar";

interface VideoPanelProps {
  candidateName: string;
  candidateAvatar: string;
  interviewerName: string;
  interviewerAvatar: string;
}

export function VideoPanel({
  candidateName,
  candidateAvatar,
  interviewerName,
  interviewerAvatar,
}: VideoPanelProps) {
  const [showTelemetryHUD, setShowTelemetryHUD] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  return (
    <div className="relative rounded-lg border border-border bg-slate-950 overflow-hidden aspect-video max-h-[280px] w-full flex items-center justify-center">
      {/* Candidate Main Video Feed */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <img
          src={candidateAvatar}
          alt={candidateName}
          className="w-full h-full object-cover object-center opacity-90"
        />

        {/* Dynamic Gaze / Face Detection Telemetry Bounding Box */}
        {showTelemetryHUD && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-32 h-40 rounded-lg border border-dashed border-sage-400/70 flex flex-col justify-between p-2">
              <div className="flex items-center justify-between text-[9px] font-mono text-sage-300 bg-sand-950/80 px-1.5 py-0.5 rounded">
                <span>GAZE: 2° CENTER</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-sage-400" /> LOCK
                </span>
              </div>
              <div className="text-center text-[9px] font-mono text-sage-300 bg-sand-950/80 px-1.5 py-0.5 rounded">
                PUPIL DIA: 3.4mm
              </div>
            </div>
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
          <div className="inline-flex items-center gap-1 rounded bg-sand-950/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-terra-400 border border-sand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-terra-500 animate-pulse" /> LIVE
          </div>
          <div className="rounded bg-sand-950/70 backdrop-blur-sm px-2 py-0.5 text-[10px] font-mono text-sand-300 border border-sand-700">
            1080p • 30 FPS • 24ms
          </div>
        </div>

        <div className="absolute top-2.5 right-2.5 z-10">
          <button
            onClick={() => setShowTelemetryHUD(!showTelemetryHUD)}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border backdrop-blur-sm transition-colors ${
              showTelemetryHUD
                ? "bg-sand-950/80 border-sage-500/50 text-sage-300"
                : "bg-sand-950/70 border-sand-700 text-sand-400 hover:text-sand-200"
            }`}
            title="Toggle Gaze Mesh HUD"
          >
            <Eye className="h-3 w-3" />
            <span className="hidden sm:inline">Telemetry Mesh</span>
          </button>
        </div>

        {/* Bottom Candidate Bar */}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 z-10 bg-sand-950/80 backdrop-blur-md px-2.5 py-1 rounded-md border border-sand-700 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-500 shrink-0" />
          <span className="font-semibold text-sand-100">{candidateName}</span>
          <Volume2 className="h-3 w-3 text-sage-400 shrink-0" />
        </div>

        {/* Floating Interviewer PiP Self-Preview */}
        <div className="absolute bottom-2.5 right-2.5 z-10 w-28 sm:w-32 rounded-md border border-white/20 bg-slate-900/90 overflow-hidden shadow-lg backdrop-blur-md">
          <div className="relative aspect-video flex items-center justify-center bg-slate-800">
            {!cameraOff ? (
              <img
                src={interviewerAvatar}
                alt={interviewerName}
                className="w-full h-full object-cover"
              />
            ) : (
              <VideoOff className="h-4 w-4 text-zinc-500" />
            )}
            <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.2 rounded text-[9px] font-medium text-white truncate max-w-[70px]">
              You
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
