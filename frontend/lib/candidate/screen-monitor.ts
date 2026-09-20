import type { CandidateSocket } from "./socket";
import { getScreenStream } from "./media";

/**
 * Live SCREEN-channel signal: the interview requires a whole-monitor share the entire time, but
 * nothing previously checked that after join — `trackState().screenIsMonitor` was only read once,
 * at the preflight gate. This polls the live track and reports if it ends (candidate clicked "Stop
 * sharing") or the browser reports it's no longer a full monitor. No frames leave the device.
 */
const CHECK_MS = 1000;
const REPEAT_MS = 20_000;

export class ScreenShareMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private downSince: number | null = null;
  private lastEmit = 0;

  constructor(private readonly socket: CandidateSocket) {}

  start(): void {
    this.timer = setInterval(() => this.check(), CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private check(): void {
    const track = getScreenStream()
      ?.getVideoTracks()
      .find((t) => t.readyState === "live");
    const surface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string } | undefined)?.displaySurface;
    const ok = !!track && (surface === undefined || surface === "monitor");

    const now = Date.now();
    if (!ok) {
      this.downSince ??= now;
      if (now - this.lastEmit >= REPEAT_MS) {
        this.lastEmit = now;
        this.socket.emit("cv.batch", {
          items: [{ type: "screen_share_stopped", ts: now, strength: 1, payload: { downMs: now - this.downSince } }],
        });
      }
    } else {
      this.downSince = null;
    }
  }
}
