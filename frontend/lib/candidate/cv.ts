import type { CandidateSocket } from "./socket";
import { getCameraStream } from "./media";

/**
 * Camera-based integrity signals, computed entirely in the candidate's browser with MediaPipe's face
 * landmarker. No frames leave the device: only three coarse events are sent to the server
 * (face_absent, multiple_faces, gaze_away), each with a strength and a duration.
 */

type CvEvent = { type: "face_absent" | "multiple_faces" | "gaze_away" | "foreign_object"; ts: number; strength: number; payload: Record<string, unknown> };

const TICK_MS = 200;
const HEARTBEAT_MS = 5000;
const ABSENT_AFTER_MS = 3000;
const ABSENT_REPEAT_MS = 10_000;
const MULTI_AFTER_MS = 2000;
const MULTI_REPEAT_MS = 15_000;
const GAZE_WINDOW = 25; // frames, about 5 s
const GAZE_AWAY_FRACTION = 0.6;
const GAZE_REPEAT_MS = 20_000;

const MODEL_URL = "/mediapipe/face_landmarker.task";
const OBJECT_MODEL_URL = "/mediapipe/efficientdet_lite0.tflite";
const OBJECT_CHECK_MS = 1000;
const OBJECT_MIN_SCORE = 0.45;
const OBJECT_WINDOW = 5; // checks
const OBJECT_MIN_HITS = 3;
const OBJECT_REPEAT_MS = 20_000;
/** COCO classes that shouldn't be in view during an interview: phones, books/notes, a second laptop, remotes. */
const FLAGGED_OBJECTS = new Set(["cell phone", "book", "laptop", "remote"]);
const WASM_URL = "/mediapipe/wasm";

// Landmark indices: nose tip, and the outer edges of the face used to estimate head yaw.
const NOSE = 1;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;

type Blend = { categoryName: string; score: number }[];
const blend = (shapes: Blend, name: string): number => shapes.find((s) => s.categoryName === name)?.score ?? 0;

export class CvProducer {
  private video: HTMLVideoElement | null = null;
  private landmarker: { detectForVideo: (v: HTMLVideoElement, ts: number) => FaceResult; close: () => void } | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastVideoTime = -1;

  private noFaceSince: number | null = null;
  private multiSince: number | null = null;
  private lastAbsentEmit = 0;
  private lastMultiEmit = 0;
  private lastGazeEmit = 0;
  private readonly gaze: boolean[] = [];
  private awayNow = false;
  private facesNow = 0;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private failed = false;
  private objects: { detectForVideo: (v: HTMLVideoElement, ts: number) => { detections: { categories: { categoryName: string; score: number }[] }[] }; close: () => void } | null = null;
  private lastObjectCheck = 0;
  private objectHistory: (string | null)[] = [];
  private lastObjectEmit = new Map<string, number>();
  private objectNow: { label: string; at: number } | null = null;
  onStatus?: (s: { state: "loading" | "ok" | "unavailable"; faces: number; away: boolean; object?: string }) => void;

  constructor(private readonly socket: CandidateSocket) {}

  /** Starts the model in the background. Until it is ready (or if it fails) the CV channels report DEGRADED. */
  start(): void {
    void this.init();
    this.statusTimer = setInterval(() => {
      const status = { state: this.failed ? ("unavailable" as const) : this.landmarker ? ("ok" as const) : ("loading" as const), faces: this.facesNow, away: this.awayNow, ...(this.objectNow && Date.now() - this.objectNow.at < 3000 ? { object: this.objectNow.label } : {}) };
      this.socket.emit("cv.status", status);
      this.onStatus?.(status);
    }, 1000);
    this.heartbeat = setInterval(() => this.socket.emit("cv.heartbeat", { status: this.landmarker ? "OK" : "DEGRADED" }), HEARTBEAT_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.tick) clearInterval(this.tick);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.tick = this.heartbeat = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.objects?.close();
    this.objects = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
  }

  private async init(): Promise<void> {
    try {
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true,
      }).catch(() =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
        }),
      );
      if (this.stopped) {
        landmarker.close();
        return;
      }
      this.landmarker = landmarker as unknown as typeof this.landmarker;

      // Foreign-object detection is a bonus: if it can't load, face and gaze analysis still work.
      try {
        const { ObjectDetector } = await import("@mediapipe/tasks-vision");
        const detector = await ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          scoreThreshold: OBJECT_MIN_SCORE,
          maxResults: 8,
        });
        if (this.stopped) detector.close();
        else this.objects = detector as unknown as typeof this.objects;
      } catch {
        this.objects = null;
      }

      // A detached, muted video element that only feeds frames to the model.
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
      document.body.appendChild(video);
      this.video = video;
      this.tick = setInterval(() => this.process(), TICK_MS);
    } catch {
      this.failed = true;
      // Stays DEGRADED via the heartbeat, so the interviewer sees that camera analysis isn't running.
    }
  }

  /** Looks for phones, books, laptops etc. about once a second; an object must persist across several checks. */
  private checkObjects(video: HTMLVideoElement, now: number): void {
    const detector = this.objects;
    if (!detector || now - this.lastObjectCheck < OBJECT_CHECK_MS) return;
    this.lastObjectCheck = now;
    let hit: { label: string; score: number } | null = null;
    try {
      const result = detector.detectForVideo(video, performance.now());
      for (const d of result.detections) {
        const top = d.categories[0];
        if (top && FLAGGED_OBJECTS.has(top.categoryName) && top.score >= OBJECT_MIN_SCORE && (!hit || top.score > hit.score)) hit = { label: top.categoryName, score: top.score };
      }
    } catch {
      return;
    }
    this.objectHistory.push(hit?.label ?? null);
    if (this.objectHistory.length > OBJECT_WINDOW) this.objectHistory.shift();
    if (!hit) return;
    this.objectNow = { label: hit.label, at: now };
    const hits = this.objectHistory.filter((l) => l === hit!.label).length;
    if (hits >= OBJECT_MIN_HITS && now - (this.lastObjectEmit.get(hit.label) ?? 0) >= OBJECT_REPEAT_MS) {
      this.lastObjectEmit.set(hit.label, now);
      this.emit({ type: "foreign_object", ts: now, strength: Math.min(1, 0.5 + hit.score / 2), payload: { object: hit.label, confidence: Number(hit.score.toFixed(2)) } });
    }
  }

  private emit(event: CvEvent): void {
    this.socket.emit("cv.batch", { items: [event] });
  }

  private process(): void {
    const video = this.video;
    const model = this.landmarker;
    const stream = getCameraStream();
    if (!video || !model) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (!stream || video.readyState < 2) {
      void video.play().catch(() => undefined);
      return;
    }
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = Date.now();
    let result: FaceResult;
    try {
      result = model.detectForVideo(video, performance.now());
    } catch {
      return;
    }
    const faces = result.faceLandmarks.length;
    this.facesNow = faces;
    this.checkObjects(video, now);

    // ---- Face presence ----
    if (faces === 0) {
      this.noFaceSince ??= now;
      const absentMs = now - this.noFaceSince;
      if (absentMs >= ABSENT_AFTER_MS && now - this.lastAbsentEmit >= ABSENT_REPEAT_MS) {
        this.lastAbsentEmit = now;
        this.emit({ type: "face_absent", ts: now, strength: Math.min(1, absentMs / 15_000 + 0.3), payload: { durationMs: absentMs } });
      }
      this.gaze.length = 0;
      this.awayNow = false;
      this.multiSince = null;
      return;
    }
    this.noFaceSince = null;

    // ---- Face count ----
    if (faces >= 2) {
      this.multiSince ??= now;
      const multiMs = now - this.multiSince;
      if (multiMs >= MULTI_AFTER_MS && now - this.lastMultiEmit >= MULTI_REPEAT_MS) {
        this.lastMultiEmit = now;
        this.emit({ type: "multiple_faces", ts: now, strength: Math.min(1, 0.5 + faces * 0.2), payload: { faces, durationMs: multiMs } });
      }
    } else {
      this.multiSince = null;
    }

    // ---- Gaze / head direction (first face only) ----
    const lm = result.faceLandmarks[0];
    const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
    const width = lm[FACE_RIGHT].x - lm[FACE_LEFT].x;
    const yaw = width > 0 ? (lm[NOSE].x - lm[FACE_LEFT].x) / width - 0.5 : 0; // 0 when facing the camera
    const eyesSideways = (blend(shapes, "eyeLookOutLeft") + blend(shapes, "eyeLookInRight")) / 2 - (blend(shapes, "eyeLookInLeft") + blend(shapes, "eyeLookOutRight")) / 2;
    const eyesDown = (blend(shapes, "eyeLookDownLeft") + blend(shapes, "eyeLookDownRight")) / 2;
    const away = Math.abs(yaw) > 0.17 || Math.abs(eyesSideways) > 0.45 || eyesDown > 0.55;

    this.awayNow = away;
    this.gaze.push(away);
    if (this.gaze.length > GAZE_WINDOW) this.gaze.shift();
    if (this.gaze.length === GAZE_WINDOW) {
      const fraction = this.gaze.filter(Boolean).length / GAZE_WINDOW;
      if (fraction >= GAZE_AWAY_FRACTION && now - this.lastGazeEmit >= GAZE_REPEAT_MS) {
        this.lastGazeEmit = now;
        this.emit({ type: "gaze_away", ts: now, strength: Math.min(1, fraction), payload: { awayFraction: Number(fraction.toFixed(2)), windowMs: GAZE_WINDOW * TICK_MS } });
      }
    }
  }
}

type FaceResult = {
  faceLandmarks: { x: number; y: number; z: number }[][];
  faceBlendshapes?: { categories: Blend }[];
};
