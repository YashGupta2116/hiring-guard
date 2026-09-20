/**
 * Speech-to-text via the browser's built-in Web Speech API (Chrome/Edge only; other browsers have
 * no implementation and this silently produces no transcript there, the same "degrade, don't
 * block" posture as lib/candidate/cv.ts). The browser vendor's own cloud recognizer turns audio
 * into text; only that text is sent onward here, batched over the socket as `asr.batch`.
 *
 * Shared between the candidate and interviewer sides -- each instance only ever transcribes that
 * browser's own microphone, and the server (sockets/index.ts) assigns the speaker from which
 * namespace sent it, never from this payload.
 */
type SRAlternative = { transcript: string; confidence: number };
type SRResult = { isFinal: boolean; length: number; [index: number]: SRAlternative };
type SRResultList = { length: number; [index: number]: SRResult };
type SREvent = { resultIndex: number; results: SRResultList };
type SRErrorEvent = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SREvent) => void) | null;
  onerror: ((event: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type EmitSocket = { emit: (event: string, payload: unknown) => void };

/** A recognized phrase rarely runs longer than this; used only to estimate startMs (see note below). */
const ASSUMED_PHRASE_MS = 3000;

export class AsrProducer {
  private recognition: SpeechRecognitionLike | null = null;
  private stopped = false;
  private readonly sessionStart: number;

  constructor(
    private readonly socket: EmitSocket,
    sessionStartedAt: string | null,
  ) {
    this.sessionStart = sessionStartedAt ? new Date(sessionStartedAt).getTime() : Date.now();
  }

  start(): void {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return; // unsupported browser: no transcript, nothing else breaks
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const segments: { text: string; startMs: number; endMs: number; isFinal: boolean }[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const text = result[0]?.transcript?.trim();
        if (!text) continue;
        // The Web Speech API gives no cross-browser word/segment timing, so this estimates a
        // fixed-length window ending now -- good enough for transcript-finalize.step.ts's ordering
        // and turn-pairing, not a precise duration.
        const endMs = Math.max(0, Date.now() - this.sessionStart);
        segments.push({ text, startMs: Math.max(0, endMs - ASSUMED_PHRASE_MS), endMs, isFinal: true });
      }
      if (segments.length > 0) this.socket.emit("asr.batch", { segments });
    };

    recognition.onerror = () => {
      // Transient (no-speech, network hiccup) and common; onend below restarts the session.
    };
    recognition.onend = () => {
      if (this.stopped) return;
      try {
        recognition.start();
      } catch {
        // Already running or briefly unavailable; the next onend retries again.
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // Some browsers throw if called before the mic permission settles; nothing to recover here.
    }
  }

  stop(): void {
    this.stopped = true;
    this.recognition?.stop();
    this.recognition = null;
  }
}
