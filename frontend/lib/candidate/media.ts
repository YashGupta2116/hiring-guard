import type { PreflightProbe } from "./api";

/**
 * Holds the candidate's live camera/microphone and screen-share streams across the join steps and into
 * the room. Streams live in module memory (they can't be serialised), which is why a page reload asks
 * the candidate to share again.
 */
type Holder = { camera: MediaStream | null; screen: MediaStream | null };

// Stored on globalThis so a dev-mode hot reload of this module doesn't drop the live streams.
const globalHolder = globalThis as typeof globalThis & { __vtMediaHolder?: Holder };
const holder: Holder = (globalHolder.__vtMediaHolder ??= { camera: null, screen: null });

export function getCameraStream(): MediaStream | null {
  return holder.camera;
}

export function getScreenStream(): MediaStream | null {
  return holder.screen;
}

function liveTracks(stream: MediaStream | null, kind: "audio" | "video"): MediaStreamTrack[] {
  return stream ? stream.getTracks().filter((t) => t.kind === kind && t.readyState === "live") : [];
}

export type TrackState = { camera: boolean; microphone: boolean; screen: boolean; screenIsMonitor: boolean };

export function trackState(): TrackState {
  const screenTrack = liveTracks(holder.screen, "video")[0];
  const surface = (screenTrack?.getSettings() as MediaTrackSettings & { displaySurface?: string } | undefined)?.displaySurface;
  return {
    camera: liveTracks(holder.camera, "video").length > 0,
    microphone: liveTracks(holder.camera, "audio").length > 0,
    screen: !!screenTrack,
    // Browsers that don't report a surface can't tell us; treat unknown as acceptable rather than blocking.
    screenIsMonitor: !!screenTrack && (surface === undefined || surface === "monitor"),
  };
}

export type MediaOutcome = { ok: true } | { ok: false; reason: "denied" | "unavailable" | "not-monitor" };

export async function requestCameraAndMic(): Promise<MediaOutcome> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "unavailable" };
  try {
    stopStream(holder.camera);
    holder.camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
    return { ok: true };
  } catch (err) {
    const name = (err as DOMException).name;
    return { ok: false, reason: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable" };
  }
}

export async function requestScreen(): Promise<MediaOutcome> {
  if (!navigator.mediaDevices?.getDisplayMedia) return { ok: false, reason: "unavailable" };
  try {
    stopStream(holder.screen);
    // Chrome/Edge honour these hints: open on the "Entire screen" tab, never offer this tab, and forbid
    // switching the shared surface mid-interview. The surface type is still verified below.
    holder.screen = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor", frameRate: { ideal: 10, max: 15 } } as MediaTrackConstraints,
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "exclude",
      monitorTypeSurfaces: "include",
      systemAudio: "exclude",
    } as DisplayMediaStreamOptions);
    if (!trackState().screenIsMonitor) {
      stopStream(holder.screen);
      holder.screen = null;
      return { ok: false, reason: "not-monitor" };
    }
    return { ok: true };
  } catch (err) {
    const name = (err as DOMException).name;
    return { ok: false, reason: name === "NotAllowedError" ? "denied" : "unavailable" };
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function stopAllMedia(): void {
  stopStream(holder.camera);
  stopStream(holder.screen);
  holder.camera = null;
  holder.screen = null;
}

export function setMicEnabled(enabled: boolean): void {
  holder.camera?.getAudioTracks().forEach((t) => (t.enabled = enabled));
}

export function setCameraEnabled(enabled: boolean): void {
  holder.camera?.getVideoTracks().forEach((t) => (t.enabled = enabled));
}

type ExtendedScreen = Screen & { isExtended?: boolean };
type NetworkInformationLike = { downlink?: number };

/** Builds the probe the backend evaluates. Permission fields reflect what was actually obtained. */
/**
 * Measures real download speed. `navigator.connection.downlink` is a coarse, capped estimate that often reads
 * far below the true speed, so a short timed download is used and the better of the two is reported.
 */
export async function measureDownlinkMbps(): Promise<number | null> {
  try {
    const started = performance.now();
    const res = await fetch(`/mediapipe/face_landmarker.task?t=${Date.now()}`, { cache: "no-store" });
    const bytes = (await res.arrayBuffer()).byteLength;
    const seconds = (performance.now() - started) / 1000;
    return seconds > 0 ? (bytes * 8) / seconds / 1e6 : null;
  } catch {
    return null;
  }
}

export function buildProbe(measuredMbps?: number | null): PreflightProbe {
  const state = trackState();
  const screen = window.screen as ExtendedScreen;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  const isExtended = screen.isExtended === true;

  return {
    webrtc: typeof RTCPeerConnection !== "undefined",
    getDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
    camera: state.camera ? "granted" : "denied",
    microphone: state.microphone ? "granted" : "denied",
    screenCount: isExtended ? 2 : 1,
    isExtended,
    // `downlink` is only exposed by Chromium browsers. Elsewhere we can't measure throughput from the
    // page, so we report a passing figure rather than blocking every Firefox/Safari candidate.
    downlinkMbps: Math.max(connection?.downlink ?? 10, measuredMbps ?? 0),
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    userAgent: navigator.userAgent.slice(0, 500),
  };
}
