"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { IntegrityGauge } from "@/components/ui/integrity-gauge";
import { ChannelBreakdown, DEFAULT_CHANNELS } from "@/components/ui/channel-breakdown";
import { FlagCard, FlagStatus } from "@/components/ui/flag-card";
import { CandidateWarning } from "@/components/ui/candidate-warning";
import { SessionPill } from "@/components/ui/session-pill";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { ArrowRight, Moon, Sun, Shield, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";

export default function DesignSystemPage() {
  const { theme, setTheme } = useTheme();
  const [flags, setFlags] = useState<
    Array<{
      id: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      timestamp: string;
      status: FlagStatus;
      narrative: string;
      channels: string[];
      scoreDelta: number;
    }>
  >([
    {
      id: "flag-1",
      severity: "HIGH",
      timestamp: "00:14:32",
      status: "OPEN",
      narrative: "Sustained off-screen gaze while a second voice was audible in the room.",
      channels: ["GAZE", "AUDIO"],
      scoreDelta: -8,
    },
    {
      id: "flag-2",
      severity: "HIGH",
      timestamp: "00:14:32",
      status: "CONFIRMED",
      narrative: "Sustained off-screen gaze while a second voice was audible in the room.",
      channels: ["GAZE", "AUDIO"],
      scoreDelta: -8,
    },
    {
      id: "flag-3",
      severity: "HIGH",
      timestamp: "00:14:32",
      status: "DISMISSED",
      narrative: "Sustained off-screen gaze while a second voice was audible in the room.",
      channels: ["GAZE", "AUDIO"],
      scoreDelta: -8,
    },
    {
      id: "flag-4",
      severity: "MEDIUM",
      timestamp: "00:14:32",
      status: "DOWNGRADED",
      narrative: "Sustained off-screen gaze while a second voice was audible in the room.",
      channels: ["GAZE", "AUDIO"],
      scoreDelta: -4,
    },
    {
      id: "flag-5",
      severity: "HIGH",
      timestamp: "00:14:32",
      status: "SUPERSEDED",
      narrative: "Sustained off-screen gaze while a second voice was audible in the room.",
      channels: ["GAZE", "AUDIO"],
      scoreDelta: -8,
    },
  ]);

  const handleAdjudicate = (id: string, action: "CONFIRM" | "DOWNGRADE" | "DISMISS") => {
    setFlags((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        if (action === "CONFIRM") return { ...f, status: "CONFIRMED" };
        if (action === "DOWNGRADE") return { ...f, status: "DOWNGRADED" };
        if (action === "DISMISS") return { ...f, status: "DISMISSED" };
        return f;
      })
    );
  };

  const palettes = [
    {
      name: "sand",
      shades: [
        { label: "10", bg: "bg-sand-10" },
        { label: "50", bg: "bg-sand-50" },
        { label: "100", bg: "bg-sand-100" },
        { label: "200", bg: "bg-sand-200" },
        { label: "300", bg: "bg-sand-300" },
        { label: "400", bg: "bg-sand-400" },
        { label: "500", bg: "bg-sand-500" },
        { label: "600", bg: "bg-sand-600" },
        { label: "700", bg: "bg-sand-700" },
        { label: "800", bg: "bg-sand-800" },
        { label: "900", bg: "bg-sand-900" },
        { label: "950", bg: "bg-sand-950" },
      ],
    },
    {
      name: "clay",
      shades: [
        { label: "50", bg: "bg-clay-50" },
        { label: "100", bg: "bg-clay-100" },
        { label: "200", bg: "bg-clay-200" },
        { label: "300", bg: "bg-clay-300" },
        { label: "400", bg: "bg-clay-400" },
        { label: "500", bg: "bg-clay-500" },
        { label: "600", bg: "bg-clay-600" },
        { label: "700", bg: "bg-clay-700" },
        { label: "800", bg: "bg-clay-800" },
      ],
    },
    {
      name: "sage",
      shades: [
        { label: "50", bg: "bg-sage-50" },
        { label: "100", bg: "bg-sage-100" },
        { label: "200", bg: "bg-sage-200" },
        { label: "300", bg: "bg-sage-300" },
        { label: "400", bg: "bg-sage-400" },
        { label: "500", bg: "bg-sage-500" },
        { label: "600", bg: "bg-sage-600" },
        { label: "700", bg: "bg-sage-700" },
      ],
    },
    {
      name: "amber",
      shades: [
        { label: "50", bg: "bg-amber-50" },
        { label: "100", bg: "bg-amber-100" },
        { label: "200", bg: "bg-amber-200" },
        { label: "300", bg: "bg-amber-300" },
        { label: "400", bg: "bg-amber-400" },
        { label: "500", bg: "bg-amber-500" },
        { label: "600", bg: "bg-amber-600" },
        { label: "700", bg: "bg-amber-700" },
      ],
    },
    {
      name: "terra",
      shades: [
        { label: "50", bg: "bg-terra-50" },
        { label: "100", bg: "bg-terra-100" },
        { label: "200", bg: "bg-terra-200" },
        { label: "300", bg: "bg-terra-300" },
        { label: "400", bg: "bg-terra-400" },
        { label: "500", bg: "bg-terra-500" },
        { label: "600", bg: "bg-terra-600" },
        { label: "700", bg: "bg-terra-700" },
      ],
    },
    {
      name: "slate",
      shades: [
        { label: "50", bg: "bg-slate-50" },
        { label: "100", bg: "bg-slate-100" },
        { label: "200", bg: "bg-slate-200" },
        { label: "300", bg: "bg-slate-300" },
        { label: "400", bg: "bg-slate-400" },
        { label: "500", bg: "bg-slate-500" },
        { label: "600", bg: "bg-slate-600" },
        { label: "700", bg: "bg-slate-700" },
      ],
    },
  ];

  return (
    <div className="space-y-12 max-w-5xl mx-auto pb-16 animate-fade-in-up">
      {/* ========================================================================= */}
      {/* PAGE 1: HEADER & FOUNDATIONS */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-2">
        <div className="flex items-center justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-semibold text-foreground tracking-tight">
              VeriTrust
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Design System · v1.0
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-7 text-xs gap-1.5"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </Button>
        </div>

        {/* Philosophy Intro */}
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            INTERVIEW INTEGRITY PLATFORM
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground font-normal leading-tight">
            A warm paper report on a desk, not a security console.
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Tokens, type and components driven entirely from <code className="bg-secondary px-1 py-0.5 rounded font-mono text-xs">src/index.css</code>. Edit the CSS variables to restyle every surface — in light and dark.
          </p>
        </div>

        {/* Foundations: Colour */}
        <div className="space-y-4 pt-4 border-t border-border/60">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            FOUNDATIONS · Colour
          </div>

          <div className="space-y-3">
            {palettes.map((p) => (
              <div key={p.name} className="space-y-1">
                <span className="text-xs font-mono text-muted-foreground lowercase">
                  {p.name}
                </span>
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  {p.shades.map((s) => (
                    <div key={s.label} className="flex flex-col items-center">
                      <div
                        className={`h-7 w-7 sm:h-9 sm:w-9 rounded-xs border border-black/10 dark:border-white/10 ${s.bg}`}
                        title={`${p.name}-${s.label}`}
                      />
                      <span className="text-[9px] font-mono text-muted-foreground/80 mt-0.5">
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Foundations: Typography */}
        <div className="space-y-4 pt-6 border-t border-border/60">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            FOUNDATIONS · Typography
          </div>

          <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-serif text-3xl sm:text-4xl text-foreground font-normal">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Fraunces 44/50
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-serif text-2xl text-foreground font-normal">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Fraunces 26/34
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-sans text-xl text-foreground font-normal">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Inter 20/28
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-sans text-base text-foreground font-normal">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Inter 16/24
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-sans text-sm text-foreground font-normal">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Inter 14/22
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-sans text-sm text-foreground font-medium uppercase tracking-wider">
                INTEGRITY, EVIDENCED.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Inter 14/20 · 500
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-sans text-xs text-foreground font-medium uppercase tracking-widest">
                INTEGRITY, EVIDENCED.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Inter 11 · uppercase
              </span>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="font-mono text-sm text-foreground">
                Integrity, evidenced.
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                JetBrains Mono 13/20
              </span>
            </div>
          </div>
        </div>

        {/* Foundations: Spacing, Radius & Elevation */}
        <div className="space-y-4 pt-6 border-t border-border/60">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            FOUNDATIONS · Spacing, radius & elevation
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Spacing 4px base */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Spacing (4px base)
              </span>
              <div className="flex items-end gap-1.5 h-16 pt-2">
                <div className="w-2 h-1 bg-clay-500 rounded-xs" title="1 (4px)" />
                <div className="w-2 h-2 bg-clay-500 rounded-xs" title="2 (8px)" />
                <div className="w-2 h-3 bg-clay-500 rounded-xs" title="3 (12px)" />
                <div className="w-2 h-4 bg-clay-500 rounded-xs" title="4 (16px)" />
                <div className="w-2 h-6 bg-clay-500 rounded-xs" title="6 (24px)" />
                <div className="w-2 h-8 bg-clay-500 rounded-xs" title="8 (32px)" />
                <div className="w-2 h-12 bg-clay-500 rounded-xs" title="12 (48px)" />
                <div className="w-2 h-16 bg-clay-500 rounded-xs" title="16 (64px)" />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground block">
                1 2 3 4 6 8 12 16...
              </span>
            </div>

            {/* Radius */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Radius
              </span>
              <div className="flex items-center gap-2 pt-2">
                <div className="h-8 w-8 rounded-xs border border-border bg-secondary flex items-center justify-center text-[9px] font-mono">
                  xs
                </div>
                <div className="h-8 w-8 rounded-sm border border-border bg-secondary flex items-center justify-center text-[9px] font-mono">
                  sm
                </div>
                <div className="h-8 w-8 rounded-md border border-border bg-secondary flex items-center justify-center text-[9px] font-mono">
                  md
                </div>
                <div className="h-8 w-8 rounded-lg border border-border bg-secondary flex items-center justify-center text-[9px] font-mono">
                  lg
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground block">
                2px · 4px · 6px · 8px
              </span>
            </div>

            {/* Elevation */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Elevation
              </span>
              <div className="flex items-center gap-2 pt-2">
                <div className="h-8 w-8 rounded-md border border-border bg-card shadow-xs flex items-center justify-center text-[9px] font-mono">
                  xs
                </div>
                <div className="h-8 w-8 rounded-md border border-border bg-card shadow-sm flex items-center justify-center text-[9px] font-mono">
                  sm
                </div>
                <div className="h-8 w-8 rounded-md border border-border bg-card shadow-md flex items-center justify-center text-[9px] font-mono">
                  md
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground block">
                Soft diffused paper elevation
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* PAGE 2: COMPONENTS & CRITICAL INTEGRITY */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-6 border-t border-border/80">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          COMPONENTS · Buttons
        </div>

        {/* Buttons Grid: variant x state */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            variant × state (md)
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1">
            <Button>Continue</Button>
            <Button className="hover:opacity-100">Continue</Button>
            <Button className="ring-2 ring-ring">Continue</Button>
            <Button className="active:scale-95">Continue</Button>
            <Button disabled>Continue</Button>
            <Button isLoading>Continue</Button>

            <Button variant="outline">Continue</Button>
            <Button variant="outline">Continue</Button>
            <Button variant="outline">Continue</Button>
            <Button variant="outline">Continue</Button>
            <Button variant="outline" disabled>Continue</Button>
            <Button variant="outline" isLoading>Continue</Button>

            <Button variant="secondary">Continue</Button>
            <Button variant="secondary">Continue</Button>
            <Button variant="secondary">Continue</Button>
            <Button variant="secondary">Continue</Button>
            <Button variant="secondary" disabled>Continue</Button>
            <Button variant="secondary" isLoading>Continue</Button>

            <Button variant="destructive">End interview</Button>
            <Button variant="destructive">End interview</Button>
            <Button variant="destructive">End interview</Button>
            <Button variant="destructive">End interview</Button>
            <Button variant="destructive" disabled>End interview</Button>
            <Button variant="destructive" isLoading>End interview</Button>

            <Button variant="action" className="gap-1 sm:col-span-2">
              Start interview <ArrowRight className="h-3 w-3" />
            </Button>
            <Button variant="action" className="gap-1 sm:col-span-2">
              Start interview <ArrowRight className="h-3 w-3" />
            </Button>
            <Button variant="destructive" className="gap-1 sm:col-span-2">
              Confirm — end interview
            </Button>
          </div>
        </div>

        {/* Components: Critical · Integrity Gauge */}
        <div className="space-y-3 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            COMPONENTS · CRITICAL · Integrity gauge
          </div>

          <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-around flex-wrap gap-6">
            <IntegrityGauge score={92} />
            <IntegrityGauge score={78} />
            <IntegrityGauge status="review" />
            <IntegrityGauge status="calibrating" />
            <IntegrityGauge status="down" />
          </div>
        </div>

        {/* Components: Critical · Channel Breakdown */}
        <div className="space-y-3 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            COMPONENTS · CRITICAL · Channel breakdown
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <ChannelBreakdown items={DEFAULT_CHANNELS} />
          </div>
        </div>

        {/* Components: Critical · Flag Cards */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              COMPONENTS · CRITICAL · Flag cards
            </div>
            <span className="text-[11px] text-muted-foreground italic">
              Severity × adjudication. Every state stays legible; a dismissed card fades but is never deleted.
            </span>
          </div>

          <div className="space-y-3">
            {flags.map((flag) => (
              <FlagCard
                key={flag.id}
                id={flag.id}
                severity={flag.severity}
                timestamp={flag.timestamp}
                status={flag.status}
                narrative={flag.narrative}
                channels={flag.channels}
                scoreDelta={flag.scoreDelta}
                onAdjudicate={(act) => handleAdjudicate(flag.id, act)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* PAGE 3: PROOF FRAMES & CANDIDATE WARNINGS */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-6 border-t border-border/80">
        {/* Severity Ladder */}
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            PROOF FRAME · Severity ladder
          </div>
          <p className="text-xs text-muted-foreground">
            Low / medium / high — in colour and in greyscale. Severity is carried by dot shape as well as hue.
          </p>

          <div className="space-y-2.5 pt-2">
            <FlagCard
              id="lad-1"
              severity="LOW"
              timestamp="00:14:32"
              narrative="Sustained off-screen gaze while a second voice was audible in the room."
              scoreDelta={-2}
            />
            <FlagCard
              id="lad-2"
              severity="MEDIUM"
              timestamp="00:14:32"
              narrative="Sustained off-screen gaze while a second voice was audible in the room."
              scoreDelta={-4}
            />
            <FlagCard
              id="lad-3"
              severity="HIGH"
              timestamp="00:14:32"
              narrative="Sustained off-screen gaze while a second voice was audible in the room."
              scoreDelta={-8}
            />
          </div>
        </div>

        {/* Unscored vs Warning */}
        <div className="space-y-2 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            PROOF FRAME · Unscored vs warning
          </div>
          <p className="text-xs text-muted-foreground">
            An unscored window (sand + hatch) must never be confusable with a medium flag — including in greyscale.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Unscored Frame */}
            <div className="h-24 rounded-md border border-border bg-hatch-sand flex items-center justify-center p-4">
              <span className="font-mono text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded border border-border">
                unscored window (hatch)
              </span>
            </div>

            {/* Medium Warning Flag */}
            <FlagCard
              id="comp-1"
              severity="MEDIUM"
              timestamp="00:14:32"
              narrative="Sustained off-screen gaze while a second voice was audible in the room."
              scoreDelta={-8}
            />
          </div>
        </div>

        {/* Candidate Warnings */}
        <div className="space-y-3 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            COMPONENTS · CRITICAL · CANDIDATE-SAFE · Candidate warnings
          </div>

          <div className="space-y-2.5">
            <CandidateWarning
              tier="NOTICE"
              message="Please keep your face within the camera frame."
            />
            <CandidateWarning
              tier="WARNING"
              message="Repeated attention loss detected."
              subMessage="Repeatedly looking away may affect your session review."
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* PAGE 4: STATUS & INPUTS & CORE PRINCIPLE */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-6 border-t border-border/80">
        {/* Paused Banner */}
        <div className="space-y-2">
          <CandidateWarning
            tier="INTERRUPT"
            message="Interview paused"
            subMessage="A second person appears to be present. Please continue alone to resume."
          />
        </div>

        {/* Session Pills */}
        <div className="space-y-3 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            COMPONENTS · Session pills
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center gap-2">
            <SessionPill status="Draft" />
            <SessionPill status="Armed" />
            <SessionPill status="Live" />
            <SessionPill status="Paused" />
            <SessionPill status="Sealing" />
            <SessionPill status="Processing" />
            <SessionPill status="Complete" />
            <SessionPill status="Aborted" />
            <SessionPill status="Expired" />
          </div>
        </div>

        {/* Status Badges & Text Inputs */}
        <div className="space-y-3 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            COMPONENTS · Status & inputs
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Left: Status badges */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-foreground block">
                Status badges
              </span>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="Clean" />
                <StatusBadge status="Advisory" />
                <StatusBadge status="High severity" />
                <StatusBadge status="System note" />
                <StatusBadge status="Unscored" />
              </div>
            </div>

            {/* Right: Text inputs */}
            <div className="space-y-3.5 rounded-lg border border-border bg-card p-4">
              <span className="text-xs font-semibold text-foreground block">
                Text inputs
              </span>

              <Input
                label="Candidate email"
                defaultValue="name@company.com"
                placeholder="name@company.com"
              />

              <Input
                label="Candidate email"
                defaultValue="name@company.com"
                error
                errorMessage="Enter a valid work email address."
              />

              <Input
                label="Session ID (read-only)"
                defaultValue="VT-2049-XK"
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Bottom Rule Banner (PDF Page 4) */}
        <div className="pt-8 border-t border-border/80 text-center">
          <p className="font-serif text-xs text-muted-foreground italic">
            "Terracotta replaces red throughout · no pure white or black · hairline structure · one accent per screen."
          </p>
        </div>
      </section>
    </div>
  );
}
