import { iceServers, type RtcSignal } from "@/lib/rtc-config";
import type { InterviewerSocket } from "./socket";

export type RtcState = "idle" | "connecting" | "connected" | "failed";

/**
 * The interviewer's side of the video call. It answers the candidate's offer, sending its own camera and
 * microphone back, and exposes the candidate's camera and screen as two separate streams.
 */
export class InterviewerRtc {
  private pc: RTCPeerConnection | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private hasRemote = false;
  private readyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly socket: InterviewerSocket,
    private readonly local: MediaStream | null,
    private readonly handlers: {
      onCamera: (stream: MediaStream | null) => void;
      onScreen: (stream: MediaStream | null) => void;
      onState: (state: RtcState) => void;
    },
  ) {}

  start(): void {
    this.socket.on("rtc.signal", this.handle);
    this.announce();
    // Keep asking until a call is up: the candidate may not have joined or shared media yet.
    this.readyTimer = setInterval(() => {
      if (this.pc?.connectionState !== "connected") this.announce();
    }, 4000);
  }

  stop(): void {
    this.socket.off("rtc.signal", this.handle);
    if (this.readyTimer) clearInterval(this.readyTimer);
    this.readyTimer = null;
    this.socket.emit("rtc.signal", { type: "bye" } satisfies RtcSignal);
    this.closePc();
    this.handlers.onCamera(null);
    this.handlers.onScreen(null);
    this.handlers.onState("idle");
  }

  announce(): void {
    this.socket.emit("rtc.signal", { type: "ready" } satisfies RtcSignal);
  }

  private closePc(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    this.pc = null;
    this.pending = [];
    this.hasRemote = false;
  }

  private handle = (msg: RtcSignal): void => {
    if (msg.type === "offer" && msg.sdp) void this.answer(msg);
    else if (msg.type === "candidate" && msg.candidate) void this.addCandidate(msg.candidate);
    else if (msg.type === "bye") {
      this.closePc();
      this.handlers.onCamera(null);
      this.handlers.onScreen(null);
      this.handlers.onState("idle");
    }
  };

  private async answer(msg: RtcSignal): Promise<void> {
    this.closePc();
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc = pc;
    this.handlers.onState("connecting");

    const screenId = msg.streams?.screen;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit("rtc.signal", { type: "candidate", candidate: e.candidate.toJSON() } satisfies RtcSignal);
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      if (screenId && stream.id === screenId) this.handlers.onScreen(stream);
      else this.handlers.onCamera(stream);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this.handlers.onState("connected");
      else if (s === "failed") {
        this.handlers.onState("failed");
        this.announce();
      } else if (s === "disconnected") this.handlers.onState("connecting");
    };

    try {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      this.hasRemote = true;
      // Reuses the offered send/receive transceivers: our camera and mic ride back on the first ones.
      const local = this.local;
      if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit("rtc.signal", { type: "answer", sdp: answer.sdp } satisfies RtcSignal);
      for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
    } catch {
      this.handlers.onState("failed");
    }
  }

  private async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.hasRemote) {
      this.pending.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate).catch(() => undefined);
  }
}
