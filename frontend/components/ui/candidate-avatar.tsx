import * as React from "react";
import { cn } from "@/lib/utils";

export interface CandidateAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function CandidateAvatar({
  src,
  name,
  size = "md",
  className,
  ...props
}: CandidateAvatarProps) {
  const [hasError, setHasError] = React.useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
    xl: "h-14 w-14 text-base",
  }[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-secondary text-foreground font-semibold ring-1 ring-border overflow-hidden select-none",
        sizeClasses,
        className
      )}
      {...props}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={name}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </div>
  );
}
