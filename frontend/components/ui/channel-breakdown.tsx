"use client";

import React from "react";
import {
  Eye,
  Mic,
  Video,
  Target,
  Keyboard,
  Wifi,
  Check,
  ShieldAlert,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChannelItem {
  id: string;
  name: string;
  channel: "GAZE" | "AUDIO" | "SCENE" | "FOCUS" | "INPUT" | "NETWORK" | string;
  score?: number | null; // e.g. 88, 74
  status: "active" | "verified" | "unscored" | "down";
  icon?: React.ReactNode;
}

export interface ChannelBreakdownProps {
  items?: ChannelItem[];
  className?: string;
  title?: string;
}

export const DEFAULT_CHANNELS: ChannelItem[] = [
  {
    id: "gaze",
    name: "Gaze",
    channel: "GAZE",
    score: 88,
    status: "active",
  },
  {
    id: "audio",
    name: "Audio",
    channel: "AUDIO",
    score: 74,
    status: "verified",
  },
  {
    id: "scene",
    name: "Scene",
    channel: "SCENE",
    score: 91,
    status: "verified",
  },
  {
    id: "focus",
    name: "Focus",
    channel: "FOCUS",
    score: 62,
    status: "active",
  },
  {
    id: "input",
    name: "Input",
    channel: "INPUT",
    score: null,
    status: "unscored",
  },
  {
    id: "network",
    name: "Network",
    channel: "NETWORK",
    score: null,
    status: "down",
  },
];

export function ChannelBreakdown({
  items = DEFAULT_CHANNELS,
  className,
  title,
}: ChannelBreakdownProps) {
  const getChannelIcon = (channel: string) => {
    switch (channel.toUpperCase()) {
      case "GAZE":
        return <Eye className="h-3.5 w-3.5" />;
      case "AUDIO":
        return <Mic className="h-3.5 w-3.5" />;
      case "SCENE":
        return <Video className="h-3.5 w-3.5" />;
      case "FOCUS":
        return <Target className="h-3.5 w-3.5" />;
      case "INPUT":
      case "PASTE":
      case "RHYTHM":
        return <Keyboard className="h-3.5 w-3.5" />;
      case "NETWORK":
      case "ENVIRONMENT":
      default:
        return <Wifi className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className={cn("space-y-2 text-xs", className)}>
      {title && (
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-1">
          {title}
        </div>
      )}

      <div className="divide-y divide-border/60 rounded-md border border-border bg-card/60">
        {items.map((item) => {
          const isVerified = item.status === "verified";
          const isUnscored = item.status === "unscored";
          const isDown = item.status === "down";

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-secondary/30"
            >
              {/* Left: Icon and Channel Name */}
              <div className="flex items-center gap-2.5 w-24 sm:w-28 shrink-0">
                <span className="text-muted-foreground">
                  {item.icon || getChannelIcon(item.channel)}
                </span>
                <span className="font-medium text-foreground text-xs">
                  {item.name}
                </span>
              </div>

              {/* Center: Linear Meter Bar */}
              <div className="flex-1 min-w-[120px] max-w-md">
                <div className="relative h-2 w-full rounded-full bg-sand-200 dark:bg-sand-800 overflow-hidden">
                  {isUnscored ? (
                    <div className="h-full w-full bg-hatch-sand" />
                  ) : isDown ? (
                    <div className="h-full w-0" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-clay-500 dark:bg-clay-400 transition-all duration-500"
                      style={{ width: `${item.score ?? 0}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Right: Metric / Status Display */}
              <div className="flex items-center justify-end gap-1.5 w-24 shrink-0 text-right font-mono text-[11px]">
                {isUnscored ? (
                  <span className="text-muted-foreground italic font-sans text-[11px]">
                    unscored
                  </span>
                ) : isDown ? (
                  <span className="text-muted-foreground/70 italic font-sans text-[11px]">
                    detector down
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {item.score}%
                    </span>
                    {isVerified && (
                      <Check className="h-3 w-3 text-sage-600 dark:text-sage-400 stroke-[2.5]" />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
