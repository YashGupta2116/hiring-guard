"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, VideoOff as VideoOffIcon, MicOff, Mic } from "lucide-react";

interface VideoPanelProps {
  candidateName: string;
  candidateAvatar?: string;
  interviewerName: string;
  isMicMuted: boolean;
  isCameraOff: boolean;
}

export function VideoPanel({
  candidateName,
  candidateAvatar,
  interviewerName,
  isMicMuted,
  isCameraOff,
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);

  const requestMedia = useCallback(async (includeAudio: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("Camera and microphone access is not supported by this browser.");
      return;
    }

    setIsRequestingMedia(true);
    setMediaError(null);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: includeAudio,
      });
      const currentStream = streamRef.current;

      if (!currentStream || includeAudio) {
        currentStream?.getTracks().forEach((track) => track.stop());
        streamRef.current = newStream;
      } else {
        const audioTracks = currentStream.getAudioTracks();
        currentStream.getVideoTracks().forEach((track) => track.stop());
        streamRef.current = new MediaStream([
          ...audioTracks,
          ...newStream.getVideoTracks(),
        ]);
      }

      const stream = streamRef.current;
      if (stream && videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setMediaError(
        "Camera and microphone access was denied. Allow access in your browser settings and try again."
      );
    } finally {
      setIsRequestingMedia(false);
    }
  }, []);

  useEffect(() => {
    void requestMedia(true);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [requestMedia]);

  useEffect(() => {
    const stream = streamRef.current;
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });

    if (isCameraOff) {
      stream?.getVideoTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live");
    if (!hasLiveVideo && stream) {
      void requestMedia(false);
    } else if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [isCameraOff, isMicMuted, requestMedia]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-black h-full shrink-0">
      {/* Candidate feed */}
      {candidateAvatar ? (
        <img
          src={candidateAvatar}
          alt={candidateName}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-400 to-blue-600 text-white text-4xl font-semibold">
          {candidateName?.charAt(0)}
        </div>
      )}

      {/* Top-left: LIVE + resolution badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
        <span className="rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
          1080p • 30 FPS • 24ms
        </span>
      </div>

      {/* Top-right: Telemetry Mesh + fullscreen */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-black/80 transition-colors">
          Telemetry Mesh
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
          title="Fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Center telemetry callouts */}
      <div className="absolute top-[40%] left-[38%] rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] font-mono text-white flex items-center gap-1.5">
        GAZE: 2°
        <br />
        CENTER
        <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
        LOCK
      </div>
      <div className="absolute top-[55%] left-[38%] rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] font-mono text-white">
        PUPIL DIA: 3.4mm
      </div>

      {/* Bottom-left: candidate name */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white">
        {isMicMuted ? (
          <MicOff className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
        {candidateName}
      </div>

      {/* Bottom-right: interviewer PiP tile */}
      <div className="absolute bottom-3 right-3 h-24 w-32 rounded-lg overflow-hidden border border-white/20 bg-neutral-800 flex items-center justify-center">
        {isCameraOff ? (
          <div className="flex flex-col items-center gap-1 text-white/70">
            <VideoOffIcon className="h-5 w-5" />
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label={`${interviewerName} camera preview`}
            className="w-full h-full object-cover"
          />
        )}
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {isMicMuted && <MicOff className="h-2.5 w-2.5 text-red-400" />}
          You
        </span>
      </div>

      {mediaError && (
        <div className="absolute bottom-28 right-3 z-10 flex max-w-xs items-center gap-2 rounded-md border border-amber-300/40 bg-black/90 px-2.5 py-2 text-[10px] text-amber-100">
          <span>{mediaError}</span>
          <button
            type="button"
            onClick={() => void requestMedia(!streamRef.current)}
            disabled={isRequestingMedia}
            className="shrink-0 rounded border border-amber-200/50 px-2 py-1 hover:bg-white/10 disabled:opacity-50"
          >
            {isRequestingMedia ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}
    </div>
  );
}