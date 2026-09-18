"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, CheckCircle2, Lock, Mail } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/** Only same-origin app paths are honoured, so ?next= cannot bounce a user to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = safeNext(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
      toast({ title: "Signed in", description: "Welcome back to VeriTrust.", type: "success" });
      router.replace(destination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Column: Visual Brand & Philosophy */}
      <div className="relative flex-1 hidden lg:flex flex-col justify-between p-12 bg-sand-950 text-sand-100 overflow-hidden border-r border-sand-800">
        {/* Subtle architectural hairline overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e0d30a_1px,transparent_1px),linear-gradient(to_bottom,#e5e0d30a_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sand-900 border border-sand-800 text-sand-100 shadow-xs">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-serif font-semibold tracking-tight text-sand-50">VeriTrust</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-sand-400 border border-sand-800 bg-sand-900 px-2 py-0.5 rounded-full">
              Enterprise
            </span>
          </div>
        </div>

        {/* Philosophy Quotation */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-sand-800 bg-sand-900/80 px-3 py-1 text-xs text-sand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
            Decision Intelligence for Technical Interviews
          </div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-sand-50 leading-tight">
            &ldquo;Don&apos;t just watch the candidate. Understand the behavioral telemetry.&rdquo;
          </h1>
          <p className="text-sand-300 text-sm leading-relaxed">
            VeriTrust combines behavioral telemetry, coding dynamics, response latency, and video observation into explainable decision intelligence. Human judgment remains sovereign.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-sand-800/80">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-sand-300 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-medium text-sand-100">Multimodal Telemetry</h4>
                <p className="text-[11px] text-sand-400">Correlated anomalies over isolated flags</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-sand-300 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-medium text-sand-100">Privacy Safeguards</h4>
                <p className="text-[11px] text-sand-400">Isolated candidate sandbox experience</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Right Column: Authentication */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 md:p-16">
        <div className="w-full max-w-md space-y-7">
          {/* Mobile Brand */}
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-lg font-serif font-semibold tracking-tight">VeriTrust</span>
          </div>

          <div>
            <h2 className="text-xl font-serif font-semibold tracking-tight text-foreground">
              Sign in to your workspace
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your work email and password
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-3.5">
          {error && (
            <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center justify-between">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-foreground">Password</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
                />
              </div>
            </div>

            <Button type="submit" variant="default" className="w-full mt-2" isLoading={isLoading}>
              Sign In to VeriTrust <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an enterprise account?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Register organization
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
