"use client";

import React, { useState } from "react";
import { Link2, Copy, Check, ExternalLink, ShieldCheck, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";
import { useToast } from "../ui/toast";

interface InterviewLinkCardProps {
  /** Short session reference shown next to the link (not part of the URL). */
  reference: string;
  /** The candidate join URL. Null when this viewer isn't allowed to see it, or the link is no longer usable. */
  url: string | null;
  /** ISO timestamp the link stops working. */
  expiresAt: string;
  isActive?: boolean;
  /** Shown instead of the URL when there is none, e.g. "Link revoked". */
  inactiveLabel?: string;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function InterviewLinkCard({ reference, url, expiresAt, isActive = true, inactiveLabel }: InterviewLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Interview link copied", description: "Candidate invitation link is in your clipboard.", type: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy automatically", description: "Select the link and copy it manually.", type: "error" });
    }
  };

  const handleOpen = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-foreground shrink-0">
              <Link2 className="h-3.5 w-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-foreground">Candidate Interview Access Link</h4>
            <StatusBadge status={isActive ? "Ready" : "Draft"} size="sm" />
          </div>

          <p className="text-[11px] text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono">
              <ShieldCheck className="h-3 w-3 text-sage-600 dark:text-sage-400" /> Ref: <strong>{reference}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Expires {formatExpiry(expiresAt)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!url} className="h-7 gap-1.5 text-xs">
            {copied ? <Check className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>

          <Button size="sm" onClick={handleOpen} disabled={!url} className="h-7 gap-1.5 text-xs">
            <ExternalLink className="h-3 w-3" />
            Open Link
          </Button>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between rounded-md border border-border/80 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground select-all overflow-hidden">
        <span className="truncate">{url ?? inactiveLabel ?? "Link not available"}</span>
        {url && (
          <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground ml-2 shrink-0">Signed</span>
        )}
      </div>
    </div>
  );
}
