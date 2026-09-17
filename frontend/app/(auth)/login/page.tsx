"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles, ArrowRight, CheckCircle2, Lock, Mail, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const { users, setCurrentUser } = useStore();
  const { toast } = useToast();
  const [email, setEmail] = useState("marcus.s@veritrust.ai");
  const [password, setPassword] = useState("••••••••••••");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      // Find matching user or fallback to first
      const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || users[1];
      setCurrentUser(found);
      setIsLoading(false);
      toast({
        title: `Welcome back, ${found.name}`,
        description: `Logged in as ${found.role} (${found.title})`,
        type: "success",
      });
      router.push("/app/dashboard");
    }, 600);
  };

  const handlePersonaSelect = (user: (typeof users)[0]) => {
    setCurrentUser(user);
    toast({
      title: `Active Persona: ${user.name}`,
      description: `Role privileges updated to ${user.role}`,
      type: "info",
    });
    router.push("/app/dashboard");
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
            "Don't just watch the candidate. Understand the behavioral telemetry."
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

        {/* Footer Meta */}
        <div className="relative z-10 text-xs text-sand-400 flex items-center justify-between font-mono">
          <span>VeriTrust System v2.4</span>
          <span>SOC2 Type II & GDPR Compliant</span>
        </div>
      </div>

      {/* Right Column: Authentication & Persona Switcher */}
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
              Enter your credentials or choose a pre-configured demo persona
            </p>
          </div>

          {/* Quick Demo Persona Switcher Banner */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Instant Demo Personas</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">1-click login</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handlePersonaSelect(user)}
                  className="flex flex-col items-center p-2 rounded-md border border-border bg-background hover:border-foreground/30 hover:bg-secondary/60 transition-all text-center group"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-7 w-7 rounded-full object-cover mb-1 ring-1 ring-border group-hover:ring-foreground/40 transition-all"
                  />
                  <span className="text-xs font-medium text-foreground truncate w-full">
                    {user.name.split(" ")[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-3.5">
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
                  placeholder="name@company.com"
                  className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-foreground">Password</label>
                <a href="#" className="text-muted-foreground hover:text-foreground text-xs transition-colors">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
                />
              </div>
            </div>

            <Button type="submit" variant="default" className="w-full mt-2" isLoading={isLoading}>
              Sign In to VeriTrust <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Don't have an enterprise account?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Register organization
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
