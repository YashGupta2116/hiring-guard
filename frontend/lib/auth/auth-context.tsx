"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as authApi from "@/lib/api/auth";
import type { AuthUser } from "@/lib/api/auth";
import { setSessionExpiredHandler } from "@/lib/api/client";
import { Loader2 } from "lucide-react";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextType {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string; orgName: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setStatus(restored ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await authApi.login(email, password);
    setUser(next);
    setStatus("authenticated");
  }, []);

  const signUp = useCallback(async (input: { name: string; email: string; password: string; orgName: string }) => {
    const next = await authApi.register(input);
    setUser(next);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signUp, signOut }), [status, user, signIn, signUp, signOut]);
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
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}
