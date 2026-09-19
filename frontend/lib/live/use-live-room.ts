"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getSession, addSessionNote, type ApiSession } from "@/lib/api/sessions";
import {
  acceptSuggestion as acceptSuggestionApi,
  adjudicateFlag as adjudicateFlagApi,
  endLiveSession,
  getLiveSnapshot,
  listFlags,
  refreshSuggestions as refreshSuggestionsApi,
  startLiveSession,
  type FlagSeverity,
  type LiveFlag,
  type LiveNote,
  type LiveSnapshot,
  type SuggestionBatch,
} from "./api";
import {
  connectInterviewerSocket,
  joinSession,
  type Frame,
  type IntegrityTick,
  type InterviewerSocket,
  type Presence,
  type ReportReady,
  type SessionState,
  type SystemDegraded,
  type TimerTick,
  type TranscriptFinal,
  type WarnIssued,
} from "./socket";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type LiveIntegrity = { score: number | null; calibrating: boolean; channels: IntegrityTick["channels"] };
export type LiveTimer = { elapsedMs: number; remainingMs: number; receivedAt: number };
export type TranscriptLine = { id: string; speaker: string; text: string; startMs: number };
export type WarningLogEntry = WarnIssued;

const ENDED = new Set(["SEALING", "PROCESSING", "COMPLETE", "ABORTED", "EXPIRED"]);
export const isEndedStatus = (status: string) => ENDED.has(status);

const upsertFlag = (list: LiveFlag[], incoming: LiveFlag): LiveFlag[] => {
  const existing = list.find((f) => f.id === incoming.id);
  // Socket frames omit `warning` and `adjudications`; keep what a REST fetch already gave us.
  const merged: LiveFlag = existing ? { ...existing, ...incoming, warning: incoming.warning ?? existing.warning, adjudications: incoming.adjudications ?? existing.adjudications } : incoming;
  const rest = list.filter((f) => f.id !== incoming.id);
  return [merged, ...rest].sort((a, b) => b.startTs.localeCompare(a.startTs));
};

export function useLiveRoom(sessionId: string) {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [integrity, setIntegrity] = useState<LiveIntegrity>({ score: null, calibrating: true, channels: [] });
  const [timer, setTimer] = useState<LiveTimer | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [flags, setFlags] = useState<LiveFlag[]>([]);
  const [notes, setNotes] = useState<LiveNote[]>([]);
  const [suggestions, setSuggestions] = useState<(SuggestionBatch & { acceptedIds: string[] }) | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [warnings, setWarnings] = useState<WarningLogEntry[]>([]);
  const [warningCount, setWarningCount] = useState(0);
  const [degraded, setDegraded] = useState<Record<string, SystemDegraded>>({});
  const [cvStatus, setCvStatus] = useState<{ state: "loading" | "ok" | "unavailable"; faces: number; away: boolean; object?: string; at: number } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const lastFrameSeq = useRef(0);
  const socketRef = useRef<InterviewerSocket | null>(null);
  const [socketInstance, setSocketInstance] = useState<InterviewerSocket | null>(null);
  const autoSuggested = useRef(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // ---- Hydrate ---------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([getSession(sessionId), getLiveSnapshot(sessionId)])
      .then(([sess, snap]) => {
        if (cancelled) return;
        setSession(sess);
        setSnapshot(snap);
        setStatus(snap.status);
        setFlags(snap.flags);
        setNotes(snap.notes);
        setWarningCount(snap.warningCount ?? 0);
        // Presence events only cover changes after we join, so seed it from the snapshot on load.
        setPresence(snap.status === "LIVE" ? { connected: snap.candidateConnected, since: new Date().toISOString() } : null);
        if (snap.integrity) setIntegrity({ score: snap.integrity.score, calibrating: snap.integrity.calibrating, channels: [] });
        setTimer({ elapsedMs: snap.elapsedMs, remainingMs: snap.remainingMs, receivedAt: Date.now() });
        lastFrameSeq.current = snap.lastFrameSeq;
        setReportId(sess.reportId);
        setError(null);
        setNotFound(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Something went wrong while loading the live room.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey]);

  const refreshFlags = useCallback(() => {
    listFlags(sessionId)
      .then(setFlags)
      .catch(() => undefined);
  }, [sessionId]);

  // ---- Real-time -------------------------------------------------------------------------------
  const hydrated = snapshot !== null;
  useEffect(() => {
    if (!hydrated) return;
    const socket = connectInterviewerSocket();
    socketRef.current = socket;
    setSocketInstance(socket);

    const track = <T,>(handler: (data: T, frame: Frame<T>) => void) => (frame: Frame<T>) => {
      lastFrameSeq.current = Math.max(lastFrameSeq.current, frame.frameSeq);
      handler(frame.data, frame);
    };

    const join = () => {
      setConnection("connecting");
      void joinSession(socket, sessionId, lastFrameSeq.current).then((res) => setConnection(res.ok ? "connected" : "disconnected"));
    };
    socket.on("connect", join);
    socket.on("disconnect", () => setConnection("disconnected"));
    socket.on("connect_error", () => setConnection("disconnected"));

    socket.on(
      "session.state",
      track<SessionState>((d) => {
        setStatus(d.status);
        setSnapshot((prev) => (prev ? { ...prev, status: d.status, startedAt: d.startedAt ?? prev.startedAt } : prev));
        // Someone else may have started it; pick up the calibration window and timer we didn't fetch ourselves.
        if (d.status === "LIVE") {
          void getLiveSnapshot(sessionId)
            .then((snap) => {
              setSnapshot(snap);
              setTimer({ elapsedMs: snap.elapsedMs, remainingMs: snap.remainingMs, receivedAt: Date.now() });
              setPresence({ connected: snap.candidateConnected, since: new Date().toISOString() });
            })
            .catch(() => undefined);
        }
      }),
    );
    socket.on("timer.tick", track<TimerTick>((d) => setTimer({ elapsedMs: d.elapsedMs, remainingMs: d.remainingMs, receivedAt: Date.now() })));
    socket.on("integrity.tick", track<IntegrityTick>((d) => setIntegrity({ score: d.score, calibrating: d.calibrating, channels: d.channels })));
    socket.on("candidate.presence", track<Presence>((d) => setPresence(d)));
    socket.on("flag.new", track<LiveFlag>((d) => setFlags((prev) => upsertFlag(prev, d))));
    socket.on("flag.update", track<LiveFlag>((d) => setFlags((prev) => upsertFlag(prev, d))));
    socket.on(
      "warn.issued",
      track<WarnIssued>((d) => {
        setWarnings((prev) => [d, ...prev].slice(0, 50));
        setWarningCount((n) => n + 1);
        refreshFlags();
      }),
    );
    socket.on("note.added", track<LiveNote>((d) => setNotes((prev) => (prev.some((n) => n.id === d.id) ? prev : [...prev, d]))));
    socket.on("qs.suggestions", track<SuggestionBatch>((d) => setSuggestions((prev) => ({ ...d, acceptedIds: prev?.batchId === d.batchId ? prev.acceptedIds : [] }))));
    socket.on(
      "system.degraded",
      track<SystemDegraded>((d) =>
        setDegraded((prev) => {
          const next = { ...prev };
          if (d.recoveredAt) delete next[d.producer];
          else next[d.producer] = d;
          return next;
        }),
      ),
    );
    socket.on("transcript.final", track<TranscriptFinal>((d) => setTranscript((prev) => (prev.some((t) => t.id === d.segmentId) ? prev : [...prev, { id: d.segmentId, speaker: d.speaker, text: d.text, startMs: d.startMs }]))));
    socket.on("cv.status", (d: { state: "loading" | "ok" | "unavailable"; faces: number; away: boolean; object?: string }) => setCvStatus({ ...d, at: Date.now() }));
    socket.on("report.ready", track<ReportReady>((d) => setReportId(d.reportId)));

    if (socket.connected) join();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    };
  }, [hydrated, sessionId, refreshFlags]);

  // Questions are generated as soon as the interview is live, so the interviewer never starts from an empty panel.
  useEffect(() => {
    if (status !== "LIVE" || connection !== "connected" || suggestions !== null || autoSuggested.current) return;
    autoSuggested.current = true;
    refreshSuggestionsApi(sessionId)
      .then((batch) => setSuggestions((prev) => prev ?? { ...batch, acceptedIds: [] }))
      .catch(() => {
        autoSuggested.current = false; // allow a retry on the next reconnect; the Suggest button also works
      });
  }, [status, connection, suggestions, sessionId]);

  // ---- Actions ---------------------------------------------------------------------------------
  const start = useCallback(async () => {
    const sess = await startLiveSession(sessionId);
    setSession(sess);
    setStatus(sess.status);
    const snap = await getLiveSnapshot(sessionId);
    setSnapshot(snap);
    setTimer({ elapsedMs: snap.elapsedMs, remainingMs: snap.remainingMs, receivedAt: Date.now() });
  }, [sessionId]);

  const end = useCallback(async () => {
    const sess = await endLiveSession(sessionId);
    setSession(sess);
    setStatus(sess.status);
    return sess.status;
  }, [sessionId]);

  const adjudicate = useCallback(
    async (flagId: string, input: { action: "CONFIRM" | "DISMISS" | "DOWNGRADE"; reason: string; toSeverity?: FlagSeverity }) => {
      await adjudicateFlagApi(flagId, input);
      refreshFlags();
    },
    [refreshFlags],
  );

  const addNote = useCallback(
    async (body: string) => {
      const note = await addSessionNote(sessionId, body);
      setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
    },
    [sessionId],
  );

  const refreshSuggestions = useCallback(async () => {
    const batch = await refreshSuggestionsApi(sessionId);
    setSuggestions((prev) => ({ ...batch, acceptedIds: prev?.batchId === batch.batchId ? prev.acceptedIds : [] }));
  }, [sessionId]);

  const acceptSuggestion = useCallback(
    async (suggestionId: string) => {
      await acceptSuggestionApi(sessionId, suggestionId);
      setSuggestions((prev) => (prev ? { ...prev, acceptedIds: [...prev.acceptedIds, suggestionId] } : prev));
    },
    [sessionId],
  );

  return {
    loading,
    error,
    notFound,
    reload,
    session,
    snapshot,
    status,
    connection,
    socket: socketInstance,
    cvStatus,
    integrity,
    timer,
    presence,
    flags,
    notes,
    suggestions,
    transcript,
    warnings,
    warningCount,
    degraded,
    reportId,
    start,
    end,
    adjudicate,
    addNote,
    refreshSuggestions,
    acceptSuggestion,
  };
}
