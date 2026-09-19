"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { AuthError, AuthField, AuthShell, PasswordMeter } from "@/components/auth/auth-shell";
import { ArrowRight, Building, Lock, Mail, User } from "lucide-react";
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
    <AuthShell
      title="Create your workspace"
      subtitle="Set up VeriTrust for your hiring team. You will be the organisation owner."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSignup} className="space-y-4">
        <AuthError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField label="Full name" icon={User} value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" placeholder="Alex Chen" />
          <AuthField label="Organization" icon={Building} value={org} onChange={(e) => setOrg(e.target.value)} required autoComplete="organization" placeholder="Acme Corp" />
        </div>
        <AuthField label="Work email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="name@company.com" />
        <div className="space-y-2">
          <AuthField label="Password" icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" placeholder="At least 10 characters" />
          <PasswordMeter password={password} />
        </div>
        <Button type="submit" variant="default" className="mt-1 h-11 w-full text-sm" isLoading={isLoading}>
          Create workspace <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}
