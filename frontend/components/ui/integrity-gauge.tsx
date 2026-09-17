"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface IntegrityGaugeProps {
  score?: number | null;
  status?: "score" | "review" | "calibrating" | "down";
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

export function IntegrityGauge({
  score = 92,
  status = "score",
  size = "md",
  className,
  showLabel = true,
}: IntegrityGaugeProps) {
  // Dimensions based on size
  const dim = size === "sm" ? 80 : size === "lg" ? 130 : 100;
  const strokeWidth = size === "sm" ? 6 : size === "lg" ? 8 : 7;
  const radius = (dim - strokeWidth * 2) / 2;
  const center = dim / 2;

  // 240 degree gauge (from 150 deg to 390 deg)
  const arcDegree = 240;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (arcDegree / 360) * circumference;

  // Determine actual display state
  const effectiveStatus =
    status !== "score"
      ? status
      : score === null || score === undefined
      ? "calibrating"
      : score < 70
      ? "review"
      : "score";

  // Calculate stroke dash offset
  const scoreRatio = Math.min(Math.max((score ?? 0) / 100, 0), 1);
  const strokeDashoffset = arcLength * (1 - scoreRatio);

  // Color mapping based on Design System tokens
  let arcColor = "stroke-sage-500 text-sage-600 dark:text-sage-400";
  if (effectiveStatus === "review" || (effectiveStatus === "score" && (score ?? 0) < 70)) {
    arcColor = "stroke-terra-500 text-terra-600 dark:text-terra-400";
  } else if (effectiveStatus === "score" && (score ?? 0) < 85) {
    arcColor = "stroke-amber-500 text-amber-600 dark:text-amber-400";
  } else if (effectiveStatus === "calibrating") {
    arcColor = "stroke-sand-400 dark:stroke-sand-600 text-sand-600 dark:text-sand-400";
  } else if (effectiveStatus === "down") {
    arcColor = "stroke-sand-300 dark:stroke-sand-700 text-sand-500 dark:text-sand-500";
  }

  // Rotation setup to have arc open at bottom
  // Start at 150 deg (top-left) to 390 deg (top-right), gap at bottom
  const startAngle = 150;

  return (
    <div className={cn("inline-flex flex-col items-center select-none", className)}>
      <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
        <svg
          width={dim}
          height={dim}
          className="overflow-visible"
          style={{ transform: `rotate(${startAngle}deg)` }}
        >
          {/* Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            className="text-sand-200 dark:text-sand-800"
          />

          {/* Active Arc */}
          {effectiveStatus !== "down" && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={
                effectiveStatus === "calibrating"
                  ? `${arcLength * 0.4} ${arcLength * 0.2}`
                  : `${arcLength} ${circumference}`
              }
              strokeDashoffset={
                effectiveStatus === "calibrating" ? 0 : strokeDashoffset
              }
              strokeLinecap="round"
              className={cn(
                "transition-all duration-700 ease-out",
                arcColor,
                effectiveStatus === "calibrating" && "animate-spin origin-center"
              )}
            />
          )}
        </svg>

        {/* Center Label / Value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
          {effectiveStatus === "score" && (
            <span className="font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
              {score}
            </span>
          )}

          {effectiveStatus === "review" && (
            <div className="flex flex-col items-center justify-center leading-tight">
              <span className="text-[11px] font-medium text-terra-600 dark:text-terra-400 uppercase tracking-tight font-sans">
                Review
              </span>
              <span className="text-[10px] text-terra-500 font-sans">
                required
              </span>
            </div>
          )}

          {effectiveStatus === "calibrating" && (
            <span className="text-[11px] font-medium text-muted-foreground font-sans animate-pulse">
              Calibrating...
            </span>
          )}

          {effectiveStatus === "down" && (
            <div className="flex flex-col items-center justify-center leading-tight">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-tight font-sans">
                Detector
              </span>
              <span className="text-[10px] text-muted-foreground/70 font-sans">
                down
              </span>
            </div>
          )}
        </div>
      </div>

      {showLabel && (
        <span className="mt-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          INTEGRITY
        </span>
      )}
    </div>
  );
}
