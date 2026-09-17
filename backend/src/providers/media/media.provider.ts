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
  createParticipantToken(input: { sessionId: string; identity: string; role: ParticipantRole; ttlSeconds: number }): Promise<string>;
  verifyCandidateTracks(sessionId: string): Promise<TrackVerification>;
  startRecording(sessionId: string): Promise<{ egressId: string; startedAt: Date }>;
  stopRecording(egressId: string): Promise<{ compositeKey: string | null; hlsKey: string | null }>;
}
