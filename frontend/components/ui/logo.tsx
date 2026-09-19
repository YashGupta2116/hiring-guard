import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  md: { text: "text-lg", tile: "h-7 w-7 rounded-lg", icon: "h-4 w-4", gap: "gap-2" },
  lg: { text: "text-xl", tile: "h-8 w-8 rounded-lg", icon: "h-[18px] w-[18px]", gap: "gap-2" },
  xl: { text: "text-2xl", tile: "h-10 w-10 rounded-xl", icon: "h-5 w-5", gap: "gap-2.5" },
};

/** The HiringGuard logo: a shield-and-check mark (guarding the hire) next to the name, in the brown brand colour. */
export function Logo({ size = "md", onDark = false, className }: { size?: keyof typeof SIZES; onDark?: boolean; className?: string }) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center select-none", s.gap, className)}>
      <span className={cn("flex shrink-0 items-center justify-center bg-clay-600 text-clay-50 shadow-sm", s.tile, onDark && "bg-clay-400 text-sand-950")}>
        <ShieldCheck className={s.icon} strokeWidth={2.2} />
      </span>
      <span className={cn("font-serif font-bold leading-none tracking-tight", s.text, onDark ? "text-clay-300" : "text-clay-700 dark:text-clay-300")}>Hiring Guard</span>
    </span>
  );
}
