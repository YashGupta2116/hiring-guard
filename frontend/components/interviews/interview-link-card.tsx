"use client";

import React, { useState } from "react";
import { Link2, Copy, Check, ExternalLink, ShieldCheck, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { StatusBadge } from "../ui/status-badge";
import { useToast } from "../ui/toast";

interface InterviewLinkCardProps {
  token: string;
  candidateLink: string;
  expiresAt?: string;
  isActive?: boolean;
}

export function InterviewLinkCard({
  token,
  candidateLink,
  expiresAt = "Expires in 24 hours",
  isActive = true,
}: InterviewLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(candidateLink);
    setCopied(true);
    toast({
      title: "Interview link copied",
      description: "Candidate invitation link is in your clipboard.",
      type: "success",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = () => {
    window.open(`/interview/${token}`, "_blank");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-foreground shrink-0">
              <Link2 className="h-3.5 w-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-foreground">
              Candidate Interview Access Link
            </h4>
            <StatusBadge status={isActive ? "Ready" : "Draft"} size="sm" />
          </div>

          <p className="text-[11px] text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono">
              <ShieldCheck className="h-3 w-3 text-sage-600 dark:text-sage-400" /> Token: <strong>{token}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {expiresAt}
            </span>
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-7 gap-1.5 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>

          <Button
            size="sm"
            onClick={handleOpen}
            className="h-7 gap-1.5 text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            Open Link
          </Button>
        </div>
      </div>

      {/* URL Display */}
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-border/80 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground select-all overflow-hidden">
        <span className="truncate">{candidateLink}</span>
        <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground ml-2 shrink-0">
          Encrypted
        </span>
      </div>
    </div>
  );
}
