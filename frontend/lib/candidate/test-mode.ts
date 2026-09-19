const KEY = "vt-test-mode";

/**
 * Development-only switch for trying an interview on one machine. Opening the candidate link with `?test=1`
 * turns off the full-screen requirement and the cancel-on-switch-away rule so the interviewer window can be
 * used alongside. It does nothing in a production build.
 */
export function isTestMode(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("test") === "1") sessionStorage.setItem(KEY, "1");
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Opens the candidate link in a half-screen popup window in test mode, leaving room for the interviewer window. */
export function openCandidateTestWindow(url: string): void {
  const width = Math.floor(window.screen.availWidth / 2);
  const features = `popup=yes,width=${width},height=${window.screen.availHeight},left=${width},top=0`;
  window.open(`${url}${url.includes("?") ? "&" : "?"}test=1`, "vt-candidate-test", features);
}
