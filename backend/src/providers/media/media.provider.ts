export type ParticipantRole = "interviewer" | "candidate";

export type TrackVerification = {
  camera: boolean;
  microphone: boolean;
  screen: boolean;
  /** Screen share must be the whole monitor, never a tab or window. */
  screenIsMonitor: boolean;
};

export interface MediaProvider {
  readonly name: string;
  readonly url: string;
  /** False when this provider produces no recording artifact. Nothing may report a recording as started or ready. */
  readonly canRecord: boolean;
  createParticipantToken(input: { sessionId: string; identity: string; role: ParticipantRole; ttlSeconds: number }): Promise<string>;
  verifyCandidateTracks(sessionId: string): Promise<TrackVerification>;
  startRecording(sessionId: string): Promise<{ egressId: string; startedAt: Date }>;
  stopRecording(egressId: string): Promise<{ compositeKey: string | null; hlsKey: string | null }>;
}
