"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Building, Home, Info, Save, Shield, User, UserPlus, Users, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePermissions } from "@/components/auth/role-guard";
import { useAuth, useCurrentUser } from "@/lib/auth/auth-context";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { updateProfile } from "@/lib/api/auth";
import {
  addMember,
  getOrg,
  listMembers,
  memberAvatarUrl,
  removeMember,
  ROLES,
  roleLabel,
  updateMemberRole,
  updateOrgName,
  type BackendRoleCode,
  type Org,
  type OrgMember,
} from "@/lib/api/org";
import { cn } from "@/lib/utils";

type TabId = "profile" | "organization" | "team" | "detection";

const TABS: { id: TabId; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "organization", label: "Organization", icon: Building },
  { id: "team", label: "Team & Permissions", icon: Users },
  { id: "detection", label: "Detection & Data", icon: Shield },
];

const card = "rounded-xl border border-border bg-card p-6 space-y-5 animate-fade-in-up shadow-xs";
const input =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const readonlyInput = "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed";

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---- Profile ------------------------------------------------------------------------------------

function ProfileTab() {
  const currentUser = useCurrentUser();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(currentUser.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== currentUser.name && trimmed.length > 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(trimmed);
      await refreshUser();
      toast({ title: "Profile updated", description: "Your display name was saved.", type: "success" });
    } catch (err) {
      setError(messageOf(err, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={card}>
      <SectionHeader title="User Profile & Identity" description="Your account information" />
      <form onSubmit={handleSave} className="space-y-4 text-xs pt-1 border-t border-border/60">
        <div className="flex items-center gap-4 rounded-lg bg-secondary/40 p-4">
          <CandidateAvatar src={currentUser.avatar} name={currentUser.name} size="lg" />
          <div className="min-w-0">
            <h4 className="font-semibold text-foreground text-base truncate">{currentUser.name}</h4>
            <p className="text-muted-foreground text-xs truncate">{currentUser.email}</p>
            <div className="mt-1.5">
              <Badge variant="outline" size="sm" className="text-[10px]">
                {roleLabel(currentUser.backendRole)} in {currentUser.orgName}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="profile-name" className="font-medium text-foreground text-sm">Display Name</label>
            <input id="profile-name" type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="profile-email" className="font-medium text-foreground text-sm">Email Address</label>
            <input id="profile-email" type="email" disabled value={currentUser.email} className={readonlyInput} />
            <p className="text-[11px] text-muted-foreground">Your email is your login and can&apos;t be changed here.</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="pt-2">
          <Button type="submit" size="sm" disabled={!dirty || saving} className="h-7.5 text-xs gap-1.5">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---- Organization -------------------------------------------------------------------------------

function OrganizationTab() {
  const { canManageSettings } = usePermissions();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useState<Org | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrg()
      .then((value) => {
        if (!cancelled) setOrg(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(messageOf(err, "The server could not be reached."));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!org) {
    return loadError ? (
      <ErrorState
        title="Could not load the organization"
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setAttempt((a) => a + 1);
        }}
      />
    ) : (
      <LoadingState variant="detail" />
    );
  }

  const value = name ?? org.name;
  const trimmed = value.trim();
  const dirty = trimmed.length > 0 && trimmed !== org.name;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgName(trimmed);
      setOrg(updated);
      setName(null);
      await refreshUser();
      toast({ title: "Organization updated", description: `The workspace is now called "${updated.name}".`, type: "success" });
    } catch (err) {
      setError(messageOf(err, "Could not save the organization."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={card}>
      <SectionHeader title="Organization & Workspace" description="How your workspace is named" />
      <form onSubmit={handleSave} className="pt-1 border-t border-border/60 text-xs space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="org-name" className="font-medium text-foreground text-sm">Workspace Name</label>
            <input id="org-name" type="text" maxLength={120} value={value} onChange={(e) => setName(e.target.value)} disabled={!canManageSettings} className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="org-slug" className="font-medium text-foreground text-sm">Workspace ID</label>
            <input id="org-slug" type="text" value={org.slug} disabled className={`${readonlyInput} font-mono`} />
            <p className="text-[11px] text-muted-foreground">Fixed when the workspace was created.</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {canManageSettings ? (
          <Button type="submit" size="sm" disabled={!dirty || saving} className="h-7.5 text-xs gap-1.5">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save changes"}
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground">Only owners and admins can rename the workspace.</p>
        )}
      </form>
    </div>
  );
}

// ---- Team ---------------------------------------------------------------------------------------

function AddMemberDialog({ open, onOpenChange, roles, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; roles: BackendRoleCode[]; onAdded: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BackendRoleCode>("INTERVIEWER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (saving) return;
    setEmail("");
    setRole("INTERVIEWER");
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await addMember(email.trim(), role);
      toast({ title: "Member added", description: `${email.trim()} is now ${roleLabel(role)}.`, type: "success" });
      setEmail("");
      setRole("INTERVIEWER");
      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(messageOf(err, "Could not add this member."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogHeader>
        <DialogTitle>Add a team member</DialogTitle>
        <DialogDescription>
          Enter the email of someone who already has a VeriTrust account. Invitations by email aren&apos;t available, so they need to sign up first.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="member-email" className="text-xs font-semibold text-foreground">Email</label>
          <input id="member-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" className={input} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="member-role" className="text-xs font-semibold text-foreground">Role</label>
          <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as BackendRoleCode)} className={input}>
            {ROLES.filter((r) => roles.includes(r.code)).map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}: {r.description}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button type="button" onClick={close} disabled={saving} className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving ? "Adding..." : "Add member"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TeamTab() {
  const currentUser = useCurrentUser();
  const { canManageTeam } = usePermissions();
  const { toast } = useToast();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<OrgMember | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMembers()
      .then((value) => {
        if (!cancelled) setMembers(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(messageOf(err, "The server could not be reached."));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  if (!members) {
    return loadError ? <ErrorState title="Could not load the team" description={loadError} onRetry={reload} /> : <LoadingState variant="cards" rows={4} />;
  }

  // Only an owner may hand out or change the owner role (the server enforces this too).
  const isOwner = currentUser.backendRole === "OWNER";
  const assignable = ROLES.filter((r) => isOwner || r.code !== "OWNER").map((r) => r.code);

  const changeRole = async (member: OrgMember, role: BackendRoleCode) => {
    setBusyId(member.id);
    try {
      await updateMemberRole(member.id, role);
      toast({ title: "Role updated", description: `${member.name} is now ${roleLabel(role)}.`, type: "success" });
      reload();
    } catch (err) {
      toast({ title: "Could not change the role", description: messageOf(err, "The request failed."), type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const member = pendingRemove;
    setBusyId(member.id);
    try {
      await removeMember(member.id);
      toast({ title: "Member removed", description: `${member.name} no longer has access to this workspace.`, type: "info" });
      reload();
    } catch (err) {
      toast({ title: "Could not remove the member", description: messageOf(err, "The request failed."), type: "error" });
    } finally {
      setBusyId(null);
      setPendingRemove(null);
    }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between pb-2 border-b border-border/60 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Team Members & Access Roles</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {members.length} member{members.length === 1 ? "" : "s"}. Owners and admins manage the team; reviewers are read-only.
          </p>
        </div>
        {canManageTeam && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="text-xs h-7.5 gap-1.5 shrink-0">
            <UserPlus className="h-3.5 w-3.5" /> Add member
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members.map((m) => {
          const isSelf = m.userId === currentUser.id;
          // Admins can't touch owners, and nobody edits their own row (avoids locking yourself out).
          const locked = !canManageTeam || isSelf || (m.role === "OWNER" && !isOwner);
          return (
            <div key={m.id} className="rounded-md border border-border/60 p-3 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CandidateAvatar src={memberAvatarUrl(m.name)} name={m.name} size="md" />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground text-xs truncate">
                    {m.name}
                    {isSelf && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(you)</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {locked ? (
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    {roleLabel(m.role)}
                  </Badge>
                ) : (
                  <>
                    <select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m, e.target.value as BackendRoleCode)}
                      className="rounded-md border border-input bg-background/60 px-2 py-1 text-[11px] text-foreground focus:outline-none"
                    >
                      {ROLES.filter((r) => assignable.includes(r.code)).map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setPendingRemove(m)}
                      disabled={busyId === m.id}
                      title="Remove from workspace"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} roles={assignable} onAdded={reload} />
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && busyId === null && setPendingRemove(null)}
        title="Remove this member?"
        description={pendingRemove ? `${pendingRemove.name} (${pendingRemove.email}) will lose access to this workspace. Their account is not deleted.` : ""}
        confirmText="Remove"
        variant="destructive"
        isLoading={busyId !== null}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

// ---- Detection & data (read-only: there are no per-organization settings for these) ---------------

function DetectionTab() {
  return (
    <div className={card}>
      <SectionHeader title="Detection & Data" description="How integrity monitoring and data retention are governed" />
      <div className="pt-1 border-t border-border/60 text-sm space-y-4 max-w-3xl">
        <div className="flex items-start gap-2 rounded-md bg-secondary/50 p-3 text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">These policies are set by the server, not per organization, so there is nothing to save on this tab. Nothing here is editable, and no values are shown that the server doesn&apos;t actually use.</p>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Detection sensitivity and thresholds</h3>
          <p className="text-muted-foreground leading-relaxed">
            Gaze, paste, focus and the other detectors use fixed thresholds and weights built into the platform, and the same version is applied to every interview so scores stay comparable. Each report records the detector version it was scored with.
          </p>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">What gets monitored in an interview</h3>
          <p className="text-muted-foreground leading-relaxed">
            You choose this per interview when you schedule it: which monitoring groups are on, and whether video, audio and screen are recorded. The candidate sees exactly that list before they consent.{" "}
            <Link href="/app/interviews" className="underline underline-offset-2 hover:text-foreground">
              Go to interviews
            </Link>
          </p>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Data retention</h3>
          <p className="text-muted-foreground leading-relaxed">
            Recordings, telemetry, evidence logs and reports each have their own retention window, applied by a nightly job configured by whoever operates the server. Candidates are shown the policy on the consent screen. To change a window, ask your server operator.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="space-y-6 animate-fade-in-up pb-12 max-w-6xl">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Home className="h-3.5 w-3.5" />
        <span>›</span>
        <Link href="/app/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span>›</span>
        <span className="text-foreground">Settings</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Your profile, the workspace, and who has access to it.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 md:sticky md:top-4 md:self-start">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
                activeTab === id ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "organization" && <OrganizationTab />}
          {activeTab === "team" && <TeamTab />}
          {activeTab === "detection" && <DetectionTab />}
        </div>
      </div>
    </div>
  );
}
