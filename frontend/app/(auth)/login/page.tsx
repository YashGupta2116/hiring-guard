"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { AuthError, AuthField, AuthShell } from "@/components/auth/auth-shell";
import { ArrowRight, Lock, Mail } from "lucide-react";
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
      toast({ title: "Signed in", description: "Welcome back to HiringGuard.", type: "success" });
      router.replace(destination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your HiringGuard workspace."
      footer={
        <>
          New to HiringGuard?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="space-y-5">
        <AuthError message={error} />
        <AuthField label="Work email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" placeholder="name@company.com" />
        <AuthField label="Password" icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Your password" />
        <Button type="submit" variant="default" className="h-11 w-full text-sm" isLoading={isLoading}>
          Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
