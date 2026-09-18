import * as React from "react";
import { Shield } from "lucide-react";

/** Neutral, trustworthy frame for the candidate-facing join steps (no app navigation, no scores). */
export function JoinShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-2.5 px-4 sm:px-6 py-3 border-b border-border bg-card">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
          <Shield className="h-4 w-4" />
        </div>
        <span className="font-serif text-base font-semibold tracking-tight">VeriTrust</span>
        <span className="text-xs text-muted-foreground">Interview</span>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-8">
        <div className={wide ? "w-full max-w-3xl" : "w-full max-w-xl"}>{children}</div>
      </main>
    </div>
  );
}

export function JoinCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xs space-y-5">
      <div>
        <h1 className="text-xl font-serif font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>}
      </div>
      {children}
    </div>
  );
}
