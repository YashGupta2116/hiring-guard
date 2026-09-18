"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Cpu, Loader2, MonitorUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JoinCard } from "./join-shell";
import { ApiError } from "@/lib/api/client";
import { runPreflight, type PreflightIssue } from "@/lib/candidate/api";
import { buildProbe, getCameraStream, requestCameraAndMic, requestScreen, trackState } from "@/lib/candidate/media";

type StepState = "idle" | "running" | "ok" | "failed";

const CAMERA_HELP: Record<string, string> = {
  denied: "Camera or microphone access was blocked. Allow both for this site in your browser's address bar, then try again.",
  unavailable: "No camera or microphone was found. Connect one and try again.",
};

const SCREEN_HELP: Record<string, string> = {
  denied: "Screen sharing was cancelled. This interview needs you to share your screen.",
  unavailable: "Your browser can't share your screen. Try a recent version of Chrome, Edge or Firefox.",
  "not-monitor": 'Please choose "Entire screen" (not a window or a tab) when your browser asks what to share.',
};

function StepRow({ icon, title, state, detail }: { icon: React.ReactNode; title: string; state: StepState; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-3.5 py-3">
      <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail && <p className={`text-xs mt-0.5 leading-relaxed ${state === "failed" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{detail}</p>}
      </div>
      <span className="shrink-0 mt-0.5">
        {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {state === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {state === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
      </span>
    </div>
  );
}

export function PreflightStep({ token, onPassed }: { token: string; onPassed: (preflightId: string) => void }) {
  const [camera, setCamera] = useState<{ state: StepState; detail?: string }>({ state: "idle" });
  const [screen, setScreen] = useState<{ state: StepState; detail?: string }>({ state: "idle" });
  const [system, setSystem] = useState<{ state: StepState; detail?: string }>({ state: "idle" });
  const [failures, setFailures] = useState<PreflightIssue[]>([]);
  const [warnings, setWarnings] = useState<PreflightIssue[]>([]);
  const [preflightId, setPreflightId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Show the candidate what the camera sees once it is granted.
  useEffect(() => {
    if (camera.state === "ok" && videoRef.current) videoRef.current.srcObject = getCameraStream();
  }, [camera.state]);

  const runCheck = async () => {
    setBusy(true);
    setFailures([]);
    setWarnings([]);
    setPreflightId(null);
    setSystem({ state: "idle" });

    setCamera({ state: "running" });
    const cam = await requestCameraAndMic();
    if (!cam.ok) {
      setCamera({ state: "failed", detail: CAMERA_HELP[cam.reason] });
      setBusy(false);
      return;
    }
    setCamera({ state: "ok", detail: "Camera and microphone are working." });

    setScreen({ state: "running", detail: "Choose your entire screen in the browser prompt." });
    const scr = await requestScreen();
    if (!scr.ok) {
      setScreen({ state: "failed", detail: SCREEN_HELP[scr.reason] });
      setBusy(false);
      return;
    }
    setScreen({ state: "ok", detail: "Your screen is being shared." });

    setSystem({ state: "running", detail: "Checking your connection and device…" });
    try {
      const result = await runPreflight(token, buildProbe());
      setFailures(result.failures);
      setWarnings(result.warnings);
      if (result.passed) {
        setPreflightId(result.preflightId);
        setSystem({ state: "ok", detail: "Your device and connection meet the requirements." });
      } else {
        setSystem({ state: "failed", detail: "Something needs attention before you can continue." });
      }
    } catch (err) {
      setSystem({ state: "failed", detail: err instanceof ApiError ? err.message : "The system check could not be completed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const stillSharing = trackState();

  return (
    <JoinCard title="System check" description="We'll confirm your camera, microphone, screen sharing and connection work before the interview. Nothing is recorded during this check.">
      <div className="space-y-2.5">
        <StepRow icon={<Camera className="h-4 w-4" />} title="Camera & microphone" state={camera.state} detail={camera.detail} />
        <StepRow icon={<MonitorUp className="h-4 w-4" />} title="Screen sharing (entire screen)" state={screen.state} detail={screen.detail} />
        <StepRow icon={<Cpu className="h-4 w-4" />} title="Connection & device" state={system.state} detail={system.detail} />
      </div>

      {camera.state === "ok" && (
        <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-52 rounded-lg bg-black object-cover" aria-label="Your camera preview" />
      )}

      {failures.length > 0 && (
        <ul className="space-y-1.5" aria-label="Problems found">
          {failures.map((f) => (
            <li key={f.code} className="flex gap-2 text-xs text-red-600 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {f.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Recommendations">
          {warnings.map((w) => (
            <li key={w.code} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {preflightId ? (
          <Button onClick={() => onPassed(preflightId)} disabled={!stillSharing.screen || !stillSharing.camera}>
            Continue
          </Button>
        ) : (
          <Button onClick={runCheck} isLoading={busy}>
            {system.state === "failed" || camera.state === "failed" || screen.state === "failed" ? "Try again" : "Start system check"}
          </Button>
        )}
      </div>
    </JoinCard>
  );
}
