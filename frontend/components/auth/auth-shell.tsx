"use client";

import React, { useId, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { CheckCircle2, Eye, EyeOff, Lock, ScanEye, Video } from "lucide-react";

const FEATURES = [
  { icon: ScanEye, title: "Multimodal telemetry", body: "Correlated signals instead of isolated flags." },
  { icon: Video, title: "Live video interviews", body: "Camera, screen and a shared coding room." },
  { icon: Lock, title: "Privacy safeguards", body: "Candidates see exactly what is collected." },
];

/** Split-screen layout shared by the sign-in and sign-up pages: brand story on the left, the form on the right. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <aside className="relative hidden lg:flex lg:w-[46%] xl:w-1/2 flex-col justify-between p-12 bg-sand-950 text-sand-100 overflow-hidden border-r border-sand-800">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e0d30a_1px,transparent_1px),linear-gradient(to_bottom,#e5e0d30a_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-sage-500/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <Logo size="lg" onDark />
        </div>

        <div className="relative z-10 max-w-lg space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sand-800 bg-sand-900/80 px-3 py-1 text-xs text-sand-300">
              <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
              Decision intelligence for technical interviews
            </div>
            <h1 className="text-4xl font-serif font-semibold tracking-tight text-sand-50 leading-[1.15]">Don&apos;t just watch the candidate. Understand the signal.</h1>
            <p className="text-sm text-sand-300 leading-relaxed">Human judgment stays in charge. HiringGuard turns behavioral telemetry, coding dynamics and video observation into evidence you can explain.</p>
          </div>

          <ul className="space-y-4 border-t border-sand-800/80 pt-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sand-800 bg-sand-900 text-sand-200">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-sand-100">{title}</p>
                  <p className="text-xs text-sand-400">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 flex items-center gap-1.5 text-[11px] text-sand-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> Evidence is cryptographically sealed at the end of every interview.
        </p>
      </aside>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="lg:hidden flex items-center gap-2.5">
            <Logo size="md" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-serif font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400">
      {message}
    </div>
  );
}

/** A labelled input with a leading icon. `type="password"` gets a show/hide toggle. */
export function AuthField({
  label,
  icon: Icon,
  type = "text",
  hint,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; icon: React.ComponentType<{ className?: string }>; type?: string; hint?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type={isPassword && visible ? "text" : type}
          {...props}
          className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Rough strength meter for the sign-up password. The server's only rule is length (10-128). */
export function PasswordMeter({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];
  const level = password.length < 10 ? 0 : score;
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= level ? colors[level] : "bg-muted"}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels[level]}{password.length < 10 ? ` (${password.length}/10 characters)` : ""}</p>
    </div>
  );
}
