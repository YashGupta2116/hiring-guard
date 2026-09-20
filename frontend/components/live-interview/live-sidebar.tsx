"use client";

import React, { useState } from "react";
import { Bot, Check, FileText, MessageSquare, Shield, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { FlagCard } from "../ui/flag-card";
import { IntegrityGauge } from "../ui/integrity-gauge";
import { useToast } from "../ui/toast";
import { ApiError } from "@/lib/api/client";
import type { LiveFlag, LiveNote, FlagSeverity } from "@/lib/live/api";
import type { LiveIntegrity, TranscriptLine } from "@/lib/live/use-live-room";
import type { useLiveRoom } from "@/lib/live/use-live-room";
import { cn } from "@/lib/utils";

type Room = ReturnType<typeof useLiveRoom>;
type Tab = "telemetry" | "assistant" | "transcript" | "notes";

/**
 * Channels fed by the browser itself, including the candidate-side MediaPipe pipeline in
 * lib/candidate/cv.ts (face presence, gaze, foreign-object scene checks — see its cv.batch events
 * and the backend's channelFor mapping in sockets/index.ts). Identity, audio and screen still need
 * an external CV/ASR/media producer this deployment doesn't have, so a zero there means "not
 * monitored", not "clean".
 */
const BROWSER_CHANNELS = new Set(["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT", "FACE", "GAZE", "SCENE"]);
const CHANNEL_LABEL: Record<string, string> = {
  GAZE: "Gaze",
  FACE: "Face",
  IDENTITY: "Identity",
  SCENE: "Scene",
  AUDIO: "Audio",
  SCREEN: "Screen",
  FOCUS: "Focus",
  PASTE: "Paste",
  RHYTHM: "Typing rhythm",
  POINTER: "Pointer",
  ENVIRONMENT: "Environment",
};

const SEVERITY_ORDER: FlagSeverity[] = ["LOW", "MEDIUM", "HIGH"];

function offsetLabel(flag: LiveFlag, startedAt: string | null): string {
  if (!startedAt) return new Date(flag.startTs).toLocaleTimeString("en-US");
  const total = Math.max(0, Math.floor((new Date(flag.startTs).getTime() - new Date(startedAt).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}

// ---- Adjudication ---------------------------------------------------------------------------------

function AdjudicationDialog({
  flag,
  action,
  onClose,
  onSubmit,
}: {
  flag: LiveFlag;
  action: "CONFIRM" | "DOWNGRADE" | "DISMISS";
  onClose: () => void;
  onSubmit: (input: { action: typeof action; reason: string; toSeverity?: FlagSeverity }) => Promise<void>;
}) {
  const lower = SEVERITY_ORDER.filter((s) => SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(flag.severity));
  const [reason, setReason] = useState("");
  const [toSeverity, setToSeverity] = useState<FlagSeverity | "">(lower[lower.length - 1] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = action === "CONFIRM" ? "Confirm this flag" : action === "DISMISS" ? "Dismiss this flag" : "Downgrade this flag";
  const blurb =
    action === "CONFIRM"
      ? "Keep the flag and its score impact. Your reason is stored with the evidence."
      : action === "DISMISS"
        ? "Mark it as a false alarm. The live score is adjusted and the report will exclude it."
        : "Lower the severity. The live score recovers part of the impact.";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ action, reason: reason.trim(), ...(action === "DOWNGRADE" && toSeverity ? { toSeverity } : {}) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your decision.");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{blurb}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-md border border-border bg-secondary/30 p-2.5 text-xs text-muted-foreground">{flag.narrative}</p>
        {action === "DOWNGRADE" && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">New severity</label>
            {lower.length === 0 ? (
              <p className="text-xs text-muted-foreground">This flag is already at the lowest severity.</p>
            ) : (
              <select value={toSeverity} onChange={(e) => setToSeverity(e.target.value as FlagSeverity)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                {lower.map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="adjudication-reason" className="text-xs font-semibold text-foreground">
            Reason (required)
          </label>
          <textarea
            id="adjudication-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={2000}
            rows={3}
            placeholder="What did you observe?"
            className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
        </div>
        {error && (
          <div role="alert" className="rounded-md border border-terra-500/30 bg-terra-500/10 px-3 py-2 text-xs text-terra-600 dark:text-terra-400">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={saving} disabled={!reason.trim() || (action === "DOWNGRADE" && lower.length === 0)}>
            Save decision
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---- Telemetry tab --------------------------------------------------------------------------------

function ChannelEvidence({ integrity }: { integrity: LiveIntegrity }) {
  if (integrity.channels.length === 0) {
    return <p className="text-xs text-muted-foreground">No channels are being monitored for this interview.</p>;
  }
  return (
    <div className="divide-y divide-border/60 rounded-md border border-border bg-card/60 text-xs">
      {integrity.channels.map((c) => {
        const browser = BROWSER_CHANNELS.has(c.channel);
        const evidence = Math.max(0, c.contribution);
        return (
          <div key={c.channel} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="w-28 shrink-0 font-medium text-foreground">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
            {!browser ? (
              <span className="flex-1 text-right text-[11px] italic text-muted-foreground" title="This channel needs a camera/audio analysis service that isn't connected, so nothing is being measured.">
                no detector connected
              </span>
            ) : !c.scored ? (
              <span className="flex-1 text-right text-[11px] italic text-muted-foreground">unscored right now</span>
            ) : (
              <>
                <div className="flex-1 h-2 rounded-full bg-sand-200 dark:bg-sand-800 overflow-hidden" title="Evidence of unusual behaviour on this channel. Empty means none.">
                  <div className="h-full rounded-full bg-clay-500 dark:bg-clay-400 transition-all duration-500" style={{ width: `${Math.min(100, (evidence / 3) * 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-foreground">{evidence.toFixed(1)}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TelemetryTab({ room, canAct }: { room: Room; canAct: boolean }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<{ flag: LiveFlag; action: "CONFIRM" | "DOWNGRADE" | "DISMISS" } | null>(null);
  const { integrity, flags, snapshot } = room;
  const roundedScore = integrity.score === null ? null : Math.round(integrity.score);

  return (
    <div className="space-y-3.5 animate-fade-in-up">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center text-center shadow-xs">
        <IntegrityGauge score={roundedScore} status={integrity.calibrating ? "calibrating" : "score"} size="md" />
        <div className="mt-2 flex items-center justify-between w-full pt-2 border-t border-border/60">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Baseline</span>
          <span className="text-[10px] font-medium text-foreground">{integrity.calibrating ? "Calibrating" : "Monitoring"}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Channels · evidence</div>
        <ChannelEvidence integrity={integrity} />
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">Flags ({flags.length})</h4>
          {canAct && flags.some((f) => f.status === "OPEN") && <span className="text-[10px] font-mono font-semibold text-terra-600 dark:text-terra-400">ADJUDICATION</span>}
        </div>

        {flags.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No flags so far. Nothing unusual has crossed a threshold.</p>
        ) : (
          flags.map((flag) => (
            <div key={flag.id} className="space-y-1">
              <FlagCard
                id={flag.id}
                severity={flag.severity}
                timestamp={offsetLabel(flag, snapshot?.startedAt ?? null)}
                status={flag.status}
                narrative={flag.narrative}
                channels={[flag.channel, ...flag.corroboratingChannels]}
                scoreDelta={-Math.round(flag.scoreDelta * 10) / 10}
                readOnly={!canAct || flag.status === "SUPERSEDED"}
                onAdjudicate={(action) => setPending({ flag, action })}
              />
              {(flag.warning || (flag.adjudications && flag.adjudications.length > 0) || flag.mergedCount > 1) && (
                <div className="px-1 text-[11px] text-muted-foreground space-y-0.5">
                  {flag.mergedCount > 1 && <p>Seen {flag.mergedCount} times</p>}
                  {flag.warning && (
                    <p>
                      Candidate warned ({flag.warning.tier.toLowerCase()}){flag.warning.acknowledgedAt ? `, acknowledged${flag.warning.ackLatencyMs ? ` in ${(flag.warning.ackLatencyMs / 1000).toFixed(1)}s` : ""}` : ""}
                    </p>
                  )}
                  {flag.adjudications?.map((a) => (
                    <p key={a.id}>
                      {a.action.toLowerCase()}
                      {a.toSeverity ? ` to ${a.toSeverity.toLowerCase()}` : ""}: {a.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {pending && (
        <AdjudicationDialog
          flag={pending.flag}
          action={pending.action}
          onClose={() => setPending(null)}
          onSubmit={async (input) => {
            await room.adjudicate(pending.flag.id, input);
            const past = { CONFIRM: "confirmed", DISMISS: "dismissed", DOWNGRADE: "downgraded" }[input.action];
            toast({ title: "Decision saved", description: `Flag ${past}.`, type: "success" });
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

// ---- Assistant tab --------------------------------------------------------------------------------

function AssistantTab({ room, canAct }: { room: Room; canAct: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const batch = room.suggestions;

  const refresh = async () => {
    setBusy(true);
    try {
      await room.refreshSuggestions();
    } catch (err) {
      toast({ title: "Couldn't get suggestions", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const accept = async (id: string) => {
    setAcceptingId(id);
    try {
      await room.acceptSuggestion(id);
    } catch (err) {
      toast({ title: "Couldn't mark it as asked", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="space-y-2.5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Follow-up questions from the job description and your question bank.</p>
        {canAct && (
          <Button size="sm" variant="outline" onClick={refresh} isLoading={busy} className="h-7 text-xs gap-1.5 shrink-0">
            <Sparkles className="h-3 w-3" /> {batch ? "Refresh" : "Suggest"}
          </Button>
        )}
      </div>

      {!batch ? (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No suggestions yet. Press Suggest to generate a set.</p>
      ) : (
        <>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Source: {batch.source === "MODEL" ? "built-in demo model" : "question bank"}
          </p>
          {batch.items.map((item) => {
            const done = batch.acceptedIds.includes(item.id);
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.topic ?? "General"}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">#{item.rank}</span>
                </div>
                <p className="text-xs text-foreground font-medium leading-relaxed">{item.text}</p>
                <p className="text-[11px] text-muted-foreground">{item.rationale}</p>
                {canAct && (
                  <div className="pt-1 flex justify-end">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-sage-700 dark:text-sage-400">
                        <Check className="h-3 w-3" /> Marked as asked
                      </span>
                    ) : (
                      <button onClick={() => accept(item.id)} disabled={acceptingId === item.id} className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline disabled:opacity-60">
                        Mark as asked
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ---- Transcript tab -------------------------------------------------------------------------------

function TranscriptTab({ lines }: { lines: TranscriptLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="space-y-2 animate-fade-in-up">
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground leading-relaxed">
          No transcript yet. Speech-to-text comes from an external audio service that posts to this session; none is connected in this environment, and audio isn&apos;t streamed.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 animate-fade-in-up">
      {lines.map((t) => (
        <div key={t.id} className="p-2.5 rounded-md border border-border/60 bg-card text-xs space-y-1">
          <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
            <span>{t.speaker}</span>
            <span className="font-mono">{Math.floor(t.startMs / 60000)}:{String(Math.floor((t.startMs % 60000) / 1000)).padStart(2, "0")}</span>
          </div>
          <p className="leading-relaxed text-[11px]">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

// ---- Notes tab ------------------------------------------------------------------------------------

function NotesTab({ notes, authorName, canAct, onAdd }: { notes: LiveNote[]; authorName: (id: string) => string; canAct: boolean; onAdd: (body: string) => Promise<void> }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onAdd(draft.trim());
      setDraft("");
    } catch (err) {
      toast({ title: "Couldn't save the note", description: err instanceof ApiError ? err.message : "Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5 animate-fade-in-up flex flex-col h-full text-xs">
      <div className="text-[11px] text-muted-foreground">Private to the interview team. Candidates never see these.</div>

      <div className="flex-1 min-h-[140px] space-y-2">
        {notes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-muted-foreground">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-md border border-border bg-secondary/20 p-2.5 text-[11px] text-foreground">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {authorName(n.authorId)} • {new Date(n.ts).toLocaleTimeString("en-US")}
              </p>
            </div>
          ))
        )}
      </div>

      {canAct && (
        <form onSubmit={submit} className="flex gap-1.5">
          <input
            type="text"
            aria-label="New note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder="Add a private note..."
            className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" isLoading={saving} disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

// ---- Sidebar --------------------------------------------------------------------------------------

export function LiveSidebar({ room, canAct }: { room: Room; canAct: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("telemetry");
  const authorName = (id: string) => room.session?.interviewers.find((i) => i.userId === id)?.name ?? "Team member";

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "telemetry", label: "Telemetry", icon: <Shield className="h-3 w-3" />, badge: room.flags.filter((f) => f.status === "OPEN").length },
    { key: "assistant", label: "Assistant", icon: <Bot className="h-3 w-3" /> },
    { key: "transcript", label: "Transcript", icon: <MessageSquare className="h-3 w-3" /> },
    { key: "notes", label: "Notes", icon: <FileText className="h-3 w-3" />, badge: room.notes.length },
  ];

  return (
    <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center border-b border-border bg-secondary/30 p-1 text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-medium transition-colors",
              activeTab === t.key ? "bg-card text-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge ? <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] font-mono">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {activeTab === "telemetry" && <TelemetryTab room={room} canAct={canAct} />}
        {activeTab === "assistant" && <AssistantTab room={room} canAct={canAct} />}
        {activeTab === "transcript" && <TranscriptTab lines={room.transcript} />}
        {activeTab === "notes" && <NotesTab notes={room.notes} authorName={authorName} canAct={canAct} onAdd={room.addNote} />}
      </div>
    </div>
  );
}
