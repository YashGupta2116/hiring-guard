"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import {
  User,
  Building,
  Shield,
  Video,
  Sliders,
  Users,
  RotateCcw,
  Save,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { currentUser, setCurrentUser, users, resetDemoData } = useStore();
  const { canManageSettings, canManageTeam } = usePermissions();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<
    "profile" | "organization" | "ai" | "monitoring" | "team" | "demo"
  >("profile");

  // Interactive state
  const [profileName, setProfileName] = useState(currentUser.name);
  const [profileTitle, setProfileTitle] = useState(currentUser.title);
  const [orgName, setOrgName] = useState("Acme Robotics Inc");
  const [anomalySensitivity, setAnomalySensitivity] = useState(75);
  const [gazeThresholdSeconds, setGazeThresholdSeconds] = useState(3.5);
  const [codePasteThresholdChars, setCodePasteThresholdChars] = useState(120);
  const [retentionDays, setRetentionDays] = useState("90");
  const [recordingEncryption, setRecordingEncryption] = useState(true);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentUser({
      ...currentUser,
      name: profileName,
      title: profileTitle,
    });
    toast({
      title: "Profile Updated",
      description: "User profile preferences have been saved.",
      type: "success",
    });
  };

  const handleSaveAISettings = () => {
    toast({
      title: "AI Telemetry Thresholds Saved",
      description: `Gaze threshold set to ${gazeThresholdSeconds}s, paste trigger at ${codePasteThresholdChars} chars.`,
      type: "success",
    });
  };

  const handleResetDemo = () => {
    resetDemoData();
    toast({
      title: "Demo Data Restored",
      description: "Initial seeded interviews, candidates, and reports restored.",
      type: "info",
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in-up pb-12">
      {/* 8. Page Header */}
      <PageHeader
        title="Settings"
        description="Manage workspace preferences, AI anomaly calibration, data retention, and team privileges."
      />

      {/* 22. Settings Categories Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1 text-xs">
        <button
          onClick={() => setActiveTab("profile")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "profile"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <User className="h-3.5 w-3.5" /> Profile
        </button>

        <button
          onClick={() => setActiveTab("organization")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "organization"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Building className="h-3.5 w-3.5" /> Organization
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "ai"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Sliders className="h-3.5 w-3.5" /> AI & Telemetry
        </button>

        <button
          onClick={() => setActiveTab("monitoring")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "monitoring"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Video className="h-3.5 w-3.5" /> Monitoring & Data
        </button>

        <button
          onClick={() => setActiveTab("team")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
            activeTab === "team"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Users className="h-3.5 w-3.5" /> Team & Permissions
        </button>

        <button
          onClick={() => setActiveTab("demo")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ml-auto",
            activeTab === "demo"
              ? "bg-secondary text-foreground font-semibold"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Demo Reset
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === "profile" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-in-up">
          <SectionHeader
            title="User Profile & Identity"
            description="Manage your account information and workspace persona"
          />

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs pt-1 border-t border-border/60">
            <div className="flex items-center gap-3.5 pb-2">
              <CandidateAvatar
                src={currentUser.avatar}
                name={currentUser.name}
                size="lg"
              />
              <div>
                <h4 className="font-semibold text-foreground text-xs">{currentUser.name}</h4>
                <p className="text-muted-foreground text-[11px]">{currentUser.email}</p>
                <div className="mt-1">
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    {currentUser.role} Role
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground text-xs">Display Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground text-xs">Job Title / Team</label>
              <input
                type="text"
                value={profileTitle}
                onChange={(e) => setProfileTitle(e.target.value)}
                className="w-full rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground text-xs">Email Address</label>
              <input
                type="email"
                disabled
                value={currentUser.email}
                className="w-full rounded-md border border-input bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" size="sm" className="h-7.5 text-xs gap-1.5">
                <Save className="h-3.5 w-3.5" /> Save changes
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Organization */}
      {activeTab === "organization" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-in-up">
          <SectionHeader
            title="Organization & Workspace"
            description="Tenant domain name, SAML SSO, and workspace configuration"
          />

          <div className="space-y-3.5 text-xs pt-1 border-t border-border/60">
            <div className="space-y-1">
              <label className="font-medium text-foreground text-xs">Workspace Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!canManageSettings}
                className="w-full rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors disabled:opacity-60"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground text-xs">Workspace Domain</label>
              <input
                type="text"
                value="acmerobotics.veritrust.ai"
                disabled
                className="w-full rounded-md border border-input bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed font-mono"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border/60">
              <div>
                <span className="font-semibold text-foreground text-xs block">SSO & SAML 2.0</span>
                <span className="text-muted-foreground text-[11px]">Enforce Okta or Google Workspace SSO</span>
              </div>
              <StatusBadge status="Approved" size="sm" />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: AI & Telemetry Sensitivity */}
      {activeTab === "ai" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-in-up">
          <SectionHeader
            title="AI Behavioral Anomaly Calibration"
            description="Fine-tune sensitivity parameters for cognitive latency, gaze vectors, and code insertion thresholds"
          />

          <div className="space-y-4 text-xs pt-1 border-t border-border/60">
            <div className="space-y-1">
              <div className="flex justify-between font-medium text-foreground text-xs">
                <span>Anomaly Sensitivity Index</span>
                <span className="font-mono">{anomalySensitivity}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={95}
                value={anomalySensitivity}
                onChange={(e) => setAnomalySensitivity(Number(e.target.value))}
                disabled={!canManageSettings}
                className="w-full accent-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Higher sensitivity detects subtle baseline discontinuities. Lower sensitivity ignores transient gaze flutters.
              </p>
            </div>

            <div className="space-y-1 pt-2 border-t border-border/60">
              <div className="flex justify-between font-medium text-foreground text-xs">
                <span>Lateral Gaze Deviation Threshold</span>
                <span className="font-mono">{gazeThresholdSeconds}s</span>
              </div>
              <input
                type="range"
                step={0.5}
                min={1.5}
                max={8.0}
                value={gazeThresholdSeconds}
                onChange={(e) => setGazeThresholdSeconds(Number(e.target.value))}
                disabled={!canManageSettings}
                className="w-full accent-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Continuous off-screen focus duration before a telemetry signal is recorded in the timeline.
              </p>
            </div>

            <div className="space-y-1 pt-2 border-t border-border/60">
              <div className="flex justify-between font-medium text-foreground text-xs">
                <span>Rapid Code Insertion Threshold</span>
                <span className="font-mono">{codePasteThresholdChars} Characters</span>
              </div>
              <input
                type="range"
                step={10}
                min={40}
                max={300}
                value={codePasteThresholdChars}
                onChange={(e) => setCodePasteThresholdChars(Number(e.target.value))}
                disabled={!canManageSettings}
                className="w-full accent-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Character volume inserted in &lt; 200ms that triggers a clipboard correlation review.
              </p>
            </div>

            <div className="pt-2">
              <Button
                size="sm"
                onClick={handleSaveAISettings}
                disabled={!canManageSettings}
                className="h-7.5 text-xs"
              >
                Save thresholds
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Monitoring & Data */}
      {activeTab === "monitoring" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-in-up">
          <SectionHeader
            title="Data Retention & Storage Policies"
            description="Compliance parameters and cloud encryption settings"
          />

          <div className="space-y-4 text-xs pt-1 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground text-xs block">Zero-Knowledge Cloud Encryption</span>
                <span className="text-[11px] text-muted-foreground">AES-256 encrypted session recording storage</span>
              </div>
              <input
                type="checkbox"
                checked={recordingEncryption}
                onChange={(e) => setRecordingEncryption(e.target.checked)}
                disabled={!canManageSettings}
                className="rounded border-input text-foreground focus:ring-ring"
              />
            </div>

            <div className="space-y-1 pt-2 border-t border-border/60">
              <label className="font-medium text-foreground text-xs block">Telemetry & Recording Retention Period</label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                disabled={!canManageSettings}
                className="w-full rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
              >
                <option value="30">30 Days (GDPR minimum)</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days (Enterprise standard)</option>
                <option value="365">365 Days (Compliance archive)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Team & Permissions */}
      {activeTab === "team" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Team Members & Access Roles</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Admin, Interviewer, and Viewer (Read-only) privileges
              </p>
            </div>
            <Button size="sm" disabled={!canManageTeam} className="text-xs h-7.5">
              Invite teammate
            </Button>
          </div>

          <div className="divide-y divide-border/60">
            {users.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-3">
                  <CandidateAvatar src={u.avatar} name={u.name} size="md" />
                  <div>
                    <div className="font-semibold text-foreground text-xs">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground">{u.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    {u.role}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCurrentUser(u);
                      toast({
                        title: `Switched Persona to ${u.name}`,
                        description: `Now evaluating platform as ${u.role}.`,
                        type: "info",
                      });
                    }}
                    className="h-6.5 text-[11px] px-2"
                  >
                    Switch to
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 6: Demo Reset */}
      {activeTab === "demo" && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3 animate-fade-in-up">
          <SectionHeader
            title="Demo Data Reset"
            description="Re-seed demo candidates, scheduled interviews, and evaluation reports"
          />

          <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border/60">
            Resetting restores all 15+ candidate interviews, 10 candidate profiles, 10 decision reports, and 20 question bank challenges to their pristine initial state.
          </p>

          <div className="pt-2">
            <Button
              variant="outline"
              onClick={handleResetDemo}
              className="gap-1.5 text-xs text-terra-600 dark:text-terra-400 hover:bg-terra-500/10 border-terra-500/30"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset workspace data
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
