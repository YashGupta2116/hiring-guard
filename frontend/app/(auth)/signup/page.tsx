"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Building, Mail, Lock, User } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function SignupPage() {
  const router = useRouter();
  const { status, signUp } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/app/dashboard");
  }, [status, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signUp({ name: name.trim(), orgName: org.trim(), email: email.trim(), password });
      toast({ title: "Workspace created", description: `${org.trim()} is ready. You are the organisation owner.`, type: "success" });
      router.replace("/app/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.fields.length > 0) {
        setError(err.fields.map((f) => `${f.path}: ${f.message}`).join(" · "));
      } else {
        setError(err instanceof ApiError ? err.message : "Could not create the workspace. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background shadow-xs mb-1">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <h1 className="text-xl font-serif font-semibold tracking-tight text-foreground">
            Create your VeriTrust Workspace
          </h1>
          <p className="text-xs text-muted-foreground">
            Deploy behavioral intelligence across your recruitment pipeline
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-xs">
          {error && (
            <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="e.g. Alex Chen"
                className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Organization Name</label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                required
                placeholder="e.g. Acme Corp"
                className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Work Email</label>
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
            <label className="text-xs font-medium text-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
                placeholder="At least 10 characters"
                className="w-full rounded-md border border-border bg-background pl-9 pr-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
              />
            </div>
          </div>

          <Button type="submit" variant="default" className="w-full mt-2" isLoading={isLoading}>
            Create Workspace <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
