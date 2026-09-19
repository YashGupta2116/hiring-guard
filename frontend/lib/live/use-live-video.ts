"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InterviewerRtc, type RtcState } from "./rtc";
import type { InterviewerSocket } from "./socket";

/**
 * Runs the interviewer's side of the video call while the interview is live: asks for the interviewer's own
 * camera and microphone, answers the candidate's offer, and exposes the candidate's camera and screen streams.
 */
export function useLiveVideo(socket: InterviewerSocket | null, enabled: boolean) {
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RtcState>("idle");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const rtcRef = useRef<InterviewerRtc | null>(null);
  const localRef = useRef<MediaStream | null>(null);

  // Acquire the interviewer's own media once. If it is denied the call still works one-way (we can see the candidate).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser can't access a camera or microphone. You can still see and hear the candidate.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localRef.current = stream;
        setLocal(stream);
      })
      .catch(() => {
        if (!cancelled) setMediaError("Camera or microphone access was blocked, so the candidate can't see or hear you. Allow access for this site and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Release the devices when leaving the room.
  useEffect(
    () => () => {
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
    },
    [],
  );

  // (Re)start the call whenever the socket is available. `local` is deliberately not awaited if it was denied.
  const mediaSettled = local !== null || mediaError !== null;
  useEffect(() => {
    if (!socket || !enabled || !mediaSettled) return;
    const rtc = new InterviewerRtc(socket, local, { onCamera: setCamera, onScreen: setScreen, onState: setState });
    rtcRef.current = rtc;
    rtc.start();
    // A reconnected socket has a new id, so the candidate must be told we are here again.
    const reannounce = () => rtc.announce();
    socket.on("connect", reannounce);
    return () => {
      socket.off("connect", reannounce);
      rtc.stop();
      rtcRef.current = null;
    };
  }, [socket, enabled, mediaSettled, local]);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((on) => {
      localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  return { local, camera, screen, state, mediaError, micOn, camOn, toggleMic, toggleCam };
}
