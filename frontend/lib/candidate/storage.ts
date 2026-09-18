/**
 * The join link is single-use: once consent is accepted it can't be opened again. The candidate token that
 * consent returns is what lets a page reload go straight back into the interview, so it is kept for the
 * lifetime of this tab (sessionStorage), never in a URL and never written to localStorage.
 */

export type StoredCandidateSession = {
  candidateToken: string;
  recording: { video: boolean; audio: boolean; screen: boolean } | null;
};

const keyFor = (joinToken: string) => `vt_candidate_${joinToken.slice(-32)}`;

export function loadCandidateSession(joinToken: string): StoredCandidateSession | null {
  try {
    const raw = sessionStorage.getItem(keyFor(joinToken));
    return raw ? (JSON.parse(raw) as StoredCandidateSession) : null;
  } catch {
    return null;
  }
}

export function saveCandidateSession(joinToken: string, value: StoredCandidateSession): void {
  try {
    sessionStorage.setItem(keyFor(joinToken), JSON.stringify(value));
  } catch {
    // Private mode: the candidate simply can't resume after a reload.
  }
}

export function clearCandidateSession(joinToken: string): void {
  try {
    sessionStorage.removeItem(keyFor(joinToken));
  } catch {
    // ignore
  }
}
