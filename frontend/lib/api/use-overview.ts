"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./client";
import { loadOverview, type Overview } from "./overview";

type State = { data: Overview | null; error: string | null; loading: boolean };

/** Loads the org snapshot on mount and whenever `watch` changes (the sidebar passes the pathname); `reload` refetches (bypassing the cache) after a change or a failure. */
export function useOverview(watch?: string): State & { reload: () => void } {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadOverview(reloadKey > 0)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "The server could not be reached.";
        setState((prev) => ({ data: prev.data, error: message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, watch]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, loading: true }));
    setReloadKey((k) => k + 1);
  }, []);

  return { ...state, reload };
}
