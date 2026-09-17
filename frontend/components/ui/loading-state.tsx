import * as React from "react";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  rows?: number;
  className?: string;
  variant?: "table" | "cards" | "detail";
}

export function LoadingState({
  rows = 4,
  className,
  variant = "table",
}: LoadingStateProps) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
            <div className="flex justify-between pt-2 border-t border-border/60">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("space-y-6 max-w-5xl mx-auto", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-xl" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  // Default "table" skeleton
  return (
    <div className={cn("rounded-md border border-border bg-card overflow-hidden", className)}>
      <div className="h-10 bg-secondary/40 border-b border-border flex items-center px-4 gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32 hidden sm:block" />
        <Skeleton className="h-3 w-20 hidden md:block" />
        <Skeleton className="h-3 w-20 ml-auto" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3.5 gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 rounded hidden sm:block" />
            <Skeleton className="h-6 w-14 rounded ml-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
