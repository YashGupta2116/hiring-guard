import { iceServers, type RtcSignal } from "@/lib/rtc-config";
import { getCameraStream, getScreenStream } from "./media";
import type { CandidateSocket } from "./socket";

type Peer = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; hasRemote: boolean };

/**
 * The candidate's side of the video call. The candidate is always the offerer: it sends its camera, microphone
 * and full-screen share, and receives the interviewer's camera and microphone. Signalling goes over the
 * candidate socket; the media flows peer-to-peer.
 */
export class CandidateRtc {
  private readonly peers = new Map<string, Peer>();
  private started = false;

  constructor(
    private readonly socket: CandidateSocket,
    private readonly onRemoteStream: (stream: MediaStream | null) => void,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.socket.on("rtc.signal", this.handle);
  }

  stop(): void {
    this.socket.off("rtc.signal", this.handle);
    for (const id of Array.from(this.peers.keys())) this.close(id);
    this.started = false;
    this.onRemoteStream(null);
  }

  /** Renegotiates with every known interviewer, e.g. after the candidate re-shared the camera or screen. */
  refresh(): void {
    Array.from(this.peers.keys()).forEach((id) => void this.offerTo(id));
  }

  private handle = (msg: RtcSignal): void => {
    const from = msg.from;
    if (!from) return;
    if (msg.type === "ready") {
      const peer = this.peers.get(from);
      const state = peer?.pc.connectionState;
      if (peer && (state === "connected" || state === "connecting" || state === "new")) return;
      void this.offerTo(from);
    } else if (msg.type === "answer" && msg.sdp) {
      void this.applyAnswer(from, msg.sdp);
    } else if (msg.type === "candidate" && msg.candidate) {
      void this.addCandidate(from, msg.candidate);
    } else if (msg.type === "bye") {
      this.close(from);
    }
  };

  private send(signal: RtcSignal): void {
    this.socket.emit("rtc.signal", signal);
  }

  private close(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.peers.delete(id);
  }

  private async offerTo(id: string): Promise<void> {
    const camera = getCameraStream();
    if (!camera) return; // nothing to send yet; the interviewer keeps asking until we do
    this.close(id);

    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = { pc, pending: [], hasRemote: false };
    this.peers.set(id, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ to: id, type: "candidate", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) this.onRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        // Try once more from scratch; the interviewer side replaces its connection on a new offer.
        setTimeout(() => {
          if (this.peers.get(id)?.pc === pc) void this.offerTo(id);
        }, 2000);
      }
    };

    camera.getTracks().forEach((track) => pc.addTrack(track, camera));
    const screen = getScreenStream();
    const screenTrack = screen?.getVideoTracks()[0];
    if (screen && screenTrack) {
      screenTrack.contentHint = "detail";
      pc.addTrack(screenTrack, screen);
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ to: id, type: "offer", sdp: offer.sdp, streams: { camera: camera.id, screen: screen?.id } });
    } catch {
      this.close(id);
    }
  }

  private async applyAnswer(id: string, sdp: string): Promise<void> {
    const peer = this.peers.get(id);
    if (!peer || peer.pc.signalingState !== "have-local-offer") return;
    try {
      await peer.pc.setRemoteDescription({ type: "answer", sdp });
      peer.hasRemote = true;
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
    } catch {
      this.close(id);
    }
  }

  private async addCandidate(id: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (!peer.hasRemote) {
      peer.pending.push(candidate);
      return;
    }
    await peer.pc.addIceCandidate(candidate).catch(() => undefined);
  }
}
