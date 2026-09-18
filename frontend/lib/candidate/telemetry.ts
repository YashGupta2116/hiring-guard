import type { CandidateSocket } from "./socket";

/**
 * Browser-side integrity signals for the backend's live engine (Design.md §5.4).
 *
 * Privacy boundary: this never records what was typed. Keystroke reporting is timing statistics only
 * (intervals, whether a key was Backspace); the editor sync sends code text only for pasted content,
 * which is exactly what the paste/authorship detectors need.
 */

type TelemetryEvent =
  | { kind: "visibility"; state: "visible" | "hidden"; ts: number }
  | { kind: "focus"; state: "focus" | "blur"; ts: number }
  | { kind: "pointer"; state: "leave" | "enter" | "idle"; durationMs?: number; ts: number }
  | { kind: "clipboard"; action: "paste" | "copy"; length: number; target: "editor" | "other"; ts: number }
  | { kind: "screen"; screenCount: number; isExtended: boolean; ts: number }
  | { kind: "device"; change: "added" | "removed"; deviceKind: "audioinput" | "videoinput"; ts: number }
  | { kind: "network"; online: boolean; effectiveType?: string; downlinkMbps?: number; ts: number }
  | { kind: "raf_gap"; gapMs: number; ts: number }
  | {
      kind: "keystroke_stats";
      windowMs: number;
      histogram: number[];
      variance: number;
      digraphVariance: number;
      backspaceRatio: number;
      bursts: number;
      ts: number;
    };

const BATCH_INTERVAL_MS = 250;
const KEYSTROKE_WINDOW_MS = 5000;
const IDLE_AFTER_MS = 30_000;
const RAF_GAP_REPORT_MS = 250;
const HISTOGRAM_BINS_MS = [50, 100, 200, 400, 800];

/** Attribute that marks the code editor's container, so a paste/copy can be classed "editor" vs "other". */
export const EDITOR_ROOT_ATTR = "data-candidate-editor";

const variance = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
};

type ExtendedScreen = Screen & { isExtended?: boolean };
type ConnectionLike = EventTarget & { effectiveType?: string; downlink?: number };

export class TelemetryReporter {
  private readonly connId = `c_${Math.random().toString(36).slice(2, 10)}`;
  private seq = 0;
  private queue: TelemetryEvent[] = [];
  private cleanups: (() => void)[] = [];

  private keystrokes: { at: number; backspace: boolean }[] = [];
  private lastActivity = Date.now();
  private idle = false;
  private pointerLeftAt: number | null = null;
  private lastScreen: { count: number; extended: boolean } | null = null;
  private lastDeviceCounts: { audioinput: number; videoinput: number } | null = null;

  constructor(private readonly socket: CandidateSocket) {}

  start(): void {
    const on = <K extends keyof DocumentEventMap>(target: Document, type: K, handler: (e: DocumentEventMap[K]) => void, capture = false) => {
      target.addEventListener(type, handler, capture);
      this.cleanups.push(() => target.removeEventListener(type, handler, capture));
    };
    const onWin = <K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, handler);
      this.cleanups.push(() => window.removeEventListener(type, handler));
    };
    const every = (fn: () => void, ms: number) => {
      const id = setInterval(fn, ms);
      this.cleanups.push(() => clearInterval(id));
    };

    on(document, "visibilitychange", () => {
      this.push({ kind: "visibility", state: document.visibilityState === "visible" ? "visible" : "hidden", ts: Date.now() }, document.hidden);
    });
    onWin("focus", () => this.push({ kind: "focus", state: "focus", ts: Date.now() }));
    onWin("blur", () => this.push({ kind: "focus", state: "blur", ts: Date.now() }, true));

    // Pointer: leaving the window, coming back (with how long it was away), and going idle.
    on(document, "mouseleave", () => {
      this.pointerLeftAt = Date.now();
      this.push({ kind: "pointer", state: "leave", ts: Date.now() });
    });
    on(document, "mouseenter", () => this.pointerReturned());
    const activity = () => {
      this.lastActivity = Date.now();
      if (this.idle) {
        this.idle = false;
        this.push({ kind: "pointer", state: "enter", ts: Date.now() });
      }
      if (this.pointerLeftAt !== null) this.pointerReturned();
    };
    on(document, "mousemove", activity);
    on(document, "keydown", activity);
    every(() => {
      const quietFor = Date.now() - this.lastActivity;
      if (!this.idle && quietFor > IDLE_AFTER_MS) {
        this.idle = true;
        this.push({ kind: "pointer", state: "idle", durationMs: quietFor, ts: Date.now() });
      }
    }, 5000);

    // Clipboard: only the length and whether it targeted the editor, never the content.
    const clip = (action: "paste" | "copy") => (e: ClipboardEvent) => {
      const target = e.target instanceof Element && e.target.closest(`[${EDITOR_ROOT_ATTR}]`) ? "editor" : "other";
      const length =
        action === "paste" ? (e.clipboardData?.getData("text")?.length ?? 0) : (window.getSelection()?.toString().length ?? 0);
      this.push({ kind: "clipboard", action, length, target, ts: Date.now() }, action === "paste");
    };
    on(document, "paste", clip("paste"), true);
    on(document, "copy", clip("copy"), true);

    // Display setup.
    const reportScreen = () => {
      const s = window.screen as ExtendedScreen;
      const extended = s.isExtended === true;
      const count = extended ? 2 : 1;
      if (this.lastScreen && this.lastScreen.count === count && this.lastScreen.extended === extended) return;
      this.lastScreen = { count, extended };
      this.push({ kind: "screen", screenCount: count, isExtended: extended, ts: Date.now() });
    };
    reportScreen();
    onWin("resize", reportScreen);
    every(reportScreen, 10_000);

    // Audio/video devices appearing or disappearing.
    if (navigator.mediaDevices?.enumerateDevices) {
      const readDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        return {
          audioinput: devices.filter((d) => d.kind === "audioinput").length,
          videoinput: devices.filter((d) => d.kind === "videoinput").length,
        };
      };
      void readDevices().then((c) => (this.lastDeviceCounts = c));
      const onChange = () => {
        void readDevices().then((now) => {
          const before = this.lastDeviceCounts;
          this.lastDeviceCounts = now;
          if (!before) return;
          for (const kind of ["audioinput", "videoinput"] as const) {
            if (now[kind] !== before[kind]) {
              this.push({ kind: "device", change: now[kind] > before[kind] ? "added" : "removed", deviceKind: kind, ts: Date.now() });
            }
          }
        });
      };
      navigator.mediaDevices.addEventListener("devicechange", onChange);
      this.cleanups.push(() => navigator.mediaDevices.removeEventListener("devicechange", onChange));
    }

    // Network.
    const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
    const reportNetwork = () =>
      this.push({ kind: "network", online: navigator.onLine, effectiveType: connection?.effectiveType, downlinkMbps: connection?.downlink, ts: Date.now() });
    onWin("online", reportNetwork);
    onWin("offline", reportNetwork);

    // Main-thread stalls (frame gaps) while the tab is visible.
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      if (gap > RAF_GAP_REPORT_MS && !document.hidden) this.push({ kind: "raf_gap", gapMs: Math.round(gap), ts: Date.now() });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.cleanups.push(() => cancelAnimationFrame(raf));

    every(() => this.flush(), BATCH_INTERVAL_MS);
    every(() => this.emitKeystrokeStats(), KEYSTROKE_WINDOW_MS);
  }

  stop(): void {
    this.flush();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }

  /** Called by the editor for every keydown; only the timing and "was Backspace" are kept. */
  recordKeystroke(isBackspace: boolean): void {
    this.keystrokes.push({ at: Date.now(), backspace: isBackspace });
  }

  private pointerReturned(): void {
    if (this.pointerLeftAt === null) return;
    const durationMs = Date.now() - this.pointerLeftAt;
    this.pointerLeftAt = null;
    this.push({ kind: "pointer", state: "enter", durationMs, ts: Date.now() });
  }

  private emitKeystrokeStats(): void {
    const now = Date.now();
    const inWindow = this.keystrokes.filter((k) => now - k.at <= KEYSTROKE_WINDOW_MS);
    this.keystrokes = [];
    if (inWindow.length < 2) return;

    const intervals = inWindow.slice(1).map((k, i) => k.at - inWindow[i]!.at);
    const histogram = new Array<number>(HISTOGRAM_BINS_MS.length + 1).fill(0);
    for (const gap of intervals) {
      const bin = HISTOGRAM_BINS_MS.findIndex((edge) => gap < edge);
      histogram[bin === -1 ? HISTOGRAM_BINS_MS.length : bin]! += 1;
    }

    let bursts = 0;
    let run = 0;
    for (const gap of intervals) {
      run = gap < 80 ? run + 1 : 0;
      if (run === 3) bursts += 1;
    }

    this.push({
      kind: "keystroke_stats",
      windowMs: KEYSTROKE_WINDOW_MS,
      histogram,
      variance: variance(intervals),
      digraphVariance: variance(intervals.slice(1).map((gap, i) => Math.abs(gap - intervals[i]!))),
      backspaceRatio: inWindow.filter((k) => k.backspace).length / inWindow.length,
      bursts,
      ts: now,
    });
  }

  private push(event: TelemetryEvent, immediate = false): void {
    this.queue.push(event);
    if (immediate) this.flush();
  }

  private flush(): void {
    if (this.queue.length === 0 || !this.socket.connected) return;
    const events = this.queue;
    this.queue = [];
    this.seq += 1;
    this.socket.emit("tel.batch", { connId: this.connId, seq: this.seq, sentAt: Date.now(), events });
  }
}

export type EditorChange = {
  changeType: "TYPE" | "PASTE" | "AUTOCOMPLETE" | "UNDO";
  rangeOffset: number;
  insertedChars: number;
  deletedChars: number;
  text?: string;
  ts: number;
};

const DELTA_INTERVAL_MS = 500;
const SNAPSHOT_INTERVAL_MS = 30_000;

/** Streams edit deltas (every 500 ms) and periodic snapshots (every 30 s) for authorship analysis. */
export class EditorSync {
  private seq = 0;
  private pending = new Map<string, EditorChange[]>();
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly socket: CandidateSocket,
    private readonly snapshotSource: () => { taskId: string; language: string; content: string } | null,
  ) {}

  start(): void {
    this.timers.push(setInterval(() => this.flush(), DELTA_INTERVAL_MS));
    this.timers.push(
      setInterval(() => {
        const snap = this.snapshotSource();
        if (snap && this.socket.connected) this.socket.emit("editor.snapshot", { ...snap, reason: "INTERVAL" });
      }, SNAPSHOT_INTERVAL_MS),
    );
  }

  stop(): void {
    this.flush();
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  push(taskId: string, change: EditorChange): void {
    this.pending.set(taskId, [...(this.pending.get(taskId) ?? []), change]);
  }

  private flush(): void {
    if (!this.socket.connected) return;
    this.pending.forEach((changes, taskId) => {
      if (changes.length === 0) return;
      this.seq += 1;
      this.socket.emit("editor.delta", { taskId, seq: this.seq, changes });
    });
    this.pending.clear();
  }
}
