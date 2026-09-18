"use client";

import React from "react";
import { useCurrentUser } from "@/lib/auth/auth-context";
import { UserRole } from "@/lib/types";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import Link from "next/link";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const currentUser = useCurrentUser();

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
        Your account (<strong>{currentUser.name}</strong>) has <strong>{currentUser.role}</strong>{" "}
        permissions. This action or page requires{" "}
        {allowedRoles.join(" or ")} privileges.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground">Ask an organisation owner or admin to change your role.</p>
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
  const currentUser = useCurrentUser();
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
