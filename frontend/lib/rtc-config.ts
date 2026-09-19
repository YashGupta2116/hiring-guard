/** ICE servers for the interviewer <-> candidate video call. STUN by default; add a TURN relay for strict networks. */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export type RtcSignal = {
  from?: string;
  to?: string;
  type: "ready" | "offer" | "answer" | "candidate" | "bye";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  streams?: { camera?: string; screen?: string };
};
