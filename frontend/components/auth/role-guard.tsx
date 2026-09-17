"use client";

import React from "react";
import { useStore } from "@/lib/store/interview-store";
import { UserRole } from "@/lib/types";
import { ShieldAlert, ArrowRight, UserCheck } from "lucide-react";
import { Button } from "../ui/button";
import Link from "next/link";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { currentUser, setCurrentUser, users } = useStore();

  const isAllowed = allowedRoles.includes(currentUser.role);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="flex min-h-[450px] flex-col items-center justify-center rounded-2xl border border-border bg-card/60 p-8 text-center backdrop-blur-md">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-bold text-foreground tracking-tight">
        Access Restricted: {currentUser.role} Role
      </h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
        Your current active persona (<strong>{currentUser.name}</strong>) has read-only{" "}
        <strong>{currentUser.role}</strong> permissions. This action or page requires{" "}
        {allowedRoles.join(" or ")} privileges.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Demo Persona Switcher
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {users
            .filter((u) => allowedRoles.includes(u.role))
            .map((u) => (
              <Button
                key={u.id}
                size="sm"
                variant="outline"
                onClick={() => setCurrentUser(u)}
                className="gap-2 border-border hover:bg-secondary hover:text-foreground text-xs"
              >
                <UserCheck className="h-3.5 w-3.5 text-foreground" />
                Switch to {u.name} ({u.role})
              </Button>
            ))}
        </div>
        <Link href="/app/dashboard" className="mt-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
            Return to Dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function usePermissions() {
  const { currentUser } = useStore();
  const isAdmin = currentUser.role === "Admin";
  const isInterviewer = currentUser.role === "Interviewer";
  const isViewer = currentUser.role === "Viewer";

  return {
    role: currentUser.role,
    isAdmin,
    isInterviewer,
    isViewer,
    canConductInterview: isAdmin || isInterviewer,
    canCreateInterview: isAdmin || isInterviewer,
    canEditInterview: isAdmin || isInterviewer,
    canDeleteInterview: isAdmin,
    canManageSettings: isAdmin,
    canManageTeam: isAdmin,
  };
}
