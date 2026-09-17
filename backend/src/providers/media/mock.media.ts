import { ulid } from "ulid";
import type { MediaProvider, ParticipantRole, TrackVerification } from "./media.provider.js";

/** Pretends every track is published. Lets the full session flow run without LiveKit. */
export class MockMediaProvider implements MediaProvider {
  readonly name = "mock";
  readonly url = "ws://localhost:7880";

  async createParticipantToken(input: { sessionId: string; identity: string; role: ParticipantRole; ttlSeconds: number }): Promise<string> {
    return `mock-media-token.${input.sessionId}.${input.role}.${input.identity}`;
  }

  async verifyCandidateTracks(_sessionId: string): Promise<TrackVerification> {
    return { camera: true, microphone: true, screen: true, screenIsMonitor: true };
  }

  async startRecording(_sessionId: string): Promise<{ egressId: string; startedAt: Date }> {
    return { egressId: `mock-egress-${ulid()}`, startedAt: new Date() };
  }

  async stopRecording(_egressId: string): Promise<{ compositeKey: string | null; hlsKey: string | null }> {
    return { compositeKey: null, hlsKey: null };
  }
}
