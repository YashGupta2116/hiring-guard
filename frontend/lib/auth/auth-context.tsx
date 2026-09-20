"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as authApi from "@/lib/api/auth";
import type { AuthUser } from "@/lib/api/auth";
import { isTransientApiError, setSessionExpiredHandler } from "@/lib/api/client";
import { clearOverviewCache } from "@/lib/api/overview";
import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextType {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string; orgName: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the signed-in user (after a name or organisation-name change). */
  refreshUser: () => Promise<void>;
  /** Re-attempts session restore after it failed for a transient reason. */
  retryRestore: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoreKey, setRestoreKey] = useState(0);
  const pathname = usePathname();
  // Candidates authenticate with their interview link, never with a staff session; don't probe for one.
  const isCandidateRoute = pathname.startsWith("/join") || pathname.startsWith("/interview/");

  useEffect(() => {
    if (isCandidateRoute) return;
    let cancelled = false;
    authApi
      .restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setStatus(restored ? "authenticated" : "unauthenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        setUser(null);
        // A rate limit, a server fault or a dropped connection says nothing about whether the
        // session is valid. Signing the user out here would throw away a good session (and the
        // work behind it) over a blip, so surface it as an error they can retry instead.
        setStatus(isTransientApiError(err) ? "error" : "unauthenticated");
      });
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [isCandidateRoute, restoreKey]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await authApi.login(email, password);
    clearOverviewCache();
    setUser(next);
    setStatus("authenticated");
  }, []);

  const signUp = useCallback(async (input: { name: string; email: string; password: string; orgName: string }) => {
    const next = await authApi.register(input);
    clearOverviewCache();
    setUser(next);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearOverviewCache();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.fetchMe());
  }, []);

  const retryRestore = useCallback(() => {
    setStatus("loading");
    setRestoreKey((k) => k + 1);
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, refreshUser, retryRestore }),
    [status, user, signIn, signUp, signOut, refreshUser, retryRestore],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** The signed-in user. Only valid beneath <AuthGate>, which guarantees a user exists. */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser must be used beneath <AuthGate>");
  return user;
}

/** Keeps signed-out visitors out of /app: shows a loader while restoring, then redirects to /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, retryRestore } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <ErrorState
          title="Couldn't reach the server"
          description="Your session is still valid — the server just didn't answer. Check that the backend is running, then try again."
          onRetry={retryRestore}
          className="w-full max-w-md"
        />
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}
