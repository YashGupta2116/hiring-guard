"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Building, Mail, Lock, User } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function SignupPage() {
  const router = useRouter();
  const { setCurrentUser } = useStore();
  const { toast } = useToast();
  const [name, setName] = useState("Dr. Elena Vance");
  const [org, setOrg] = useState("Acme Robotics Inc");
  const [email, setEmail] = useState("elena@acmerobotics.com");
  const [password, setPassword] = useState("••••••••••••");
  const [role, setRole] = useState<"Admin" | "Interviewer">("Admin");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      const newUser = {
        id: `usr-${Date.now()}`,
        name,
        email,
        role: role as any,
        avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
        title: `${role} (${org})`,
      };
      setCurrentUser(newUser);
      setIsLoading(false);
      toast({
        title: "Workspace created successfully",
        description: `Logged in as ${role} for ${org}`,
        type: "success",
      });
      router.push("/app/dashboard");
    }, 600);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background shadow-xs mb-1">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Create your VeriTrust Workspace
          </h1>
          <p className="text-xs text-muted-foreground">
            Deploy behavioral intelligence across your recruitment pipeline
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-xs">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
            <label className="text-xs font-medium text-foreground">Role</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("Admin")}
                className={`py-1.5 px-3 text-xs rounded-md border transition-all ${
                  role === "Admin"
                    ? "border-foreground bg-secondary text-foreground font-medium shadow-xs"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                }`}
              >
                Admin (Full Access)
              </button>
              <button
                type="button"
                onClick={() => setRole("Interviewer")}
                className={`py-1.5 px-3 text-xs rounded-md border transition-all ${
                  role === "Interviewer"
                    ? "border-foreground bg-secondary text-foreground font-medium shadow-xs"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                }`}
              >
                Lead Interviewer
              </button>
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
                placeholder="••••••••••••"
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
