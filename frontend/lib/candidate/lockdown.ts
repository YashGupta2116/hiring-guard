export type ViolationKind = "left_fullscreen" | "tab_hidden" | "window_blur";

const BLUR_GRACE_MS = 1500;
const CLIPBOARD_KEYS = new Set(["c", "v", "x", "insert"]);

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Locks the interview page down: no copy, cut, paste, drag-and-drop or context menu anywhere (including
 * the code editor), and any exit from full screen, hidden tab or lost window focus is reported as a
 * violation. Clipboard events are cancelled at the document (capture phase), where the telemetry
 * reporter also listens, so each attempt is still seen and flagged.
 *
 * Violations are only reported while `isArmed()` is true, so the caller controls when the rules start.
 */
export function startLockdown(opts: { isArmed: () => boolean; onViolation: (kind: ViolationKind) => void; onBlocked?: () => void }): () => void {
  const cleanups: (() => void)[] = [];
  const on = (target: Document | Window, type: string, handler: (e: never) => void, capture = false) => {
    target.addEventListener(type, handler as EventListener, capture);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener, capture));
  };

  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onBlocked?.();
  };
  for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart", "drop"]) on(document, type, block, true);

  on(
    document,
    "keydown",
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const combo = (e.ctrlKey || e.metaKey) && CLIPBOARD_KEYS.has(key);
      const shiftInsert = e.shiftKey && key === "insert";
      if (combo || shiftInsert) block(e);
    },
    true,
  );

  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  const violate = (kind: ViolationKind) => {
    if (opts.isArmed()) opts.onViolation(kind);
  };

  on(document, "fullscreenchange", () => {
    if (!document.fullscreenElement) violate("left_fullscreen");
  });
  on(document, "visibilitychange", () => {
    if (document.hidden) violate("tab_hidden");
  });
  on(window, "blur", () => {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (!document.hasFocus()) violate("window_blur");
    }, BLUR_GRACE_MS);
  });
  on(window, "focus", () => {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = null;
  });

  return () => {
    if (blurTimer) clearTimeout(blurTimer);
    cleanups.forEach((fn) => fn());
  };
}
