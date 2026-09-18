"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { useStore } from "@/lib/store/interview-store";
import { Candidate } from "@/lib/types";
import { useToast } from "../ui/toast";
import { UserPlus, User, Mail, Briefcase, MapPin, BarChart3, Tag, FileText } from "lucide-react";

interface AddCandidateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BIO_MAX = 1000;

/** Label row: field name, optional red required asterisk. */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-semibold text-foreground">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

/** Muted one-line helper text shown under a field. */
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

/** Text/email/number input with a leading icon chip, matching the reference look. */
function IconInput({
  icon,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="flex items-stretch w-full rounded-lg border border-input bg-background overflow-hidden focus-within:border-foreground/40 transition-colors">
      <span className="flex items-center justify-center px-3 bg-muted/60 text-muted-foreground shrink-0">
        {icon}
      </span>
      <input
        {...props}
        className={`flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none ${className}`}
      />
    </div>
  );
}

export function AddCandidateModal({ open, onOpenChange }: AddCandidateModalProps) {
  const { addCandidate } = useStore();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [appliedRole, setAppliedRole] = useState("Senior Distributed Systems Engineer");
  const [location, setLocation] = useState("San Francisco, CA (Remote)");
  const [experienceYears, setExperienceYears] = useState(5);
  const [skills, setSkills] = useState("TypeScript, React, Node.js, Go");
  const [bio, setBio] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const newCand: Candidate = {
      id: `cand-${Date.now()}`,
      name,
      email,
      avatar: `https://images.unsplash.com/photo-${1534528741775 + Math.floor(Math.random() * 1000)}?w=150&auto=format&fit=crop&q=80`,
      appliedRole,
      experienceYears,
      location,
      interviewsTaken: 0,
      lastInterviewDate: "Never",
      averageScore: 0,
      status: "Interviewing",
      bio: bio || `Software engineer with ${experienceYears} years of experience specializing in ${appliedRole}.`,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      strengths: ["Strong problem-solving mindset"],
      weaknesses: ["Needs domain specific onboarding"],
      notes: "Newly added candidate to the pipeline.",
      radarScores: [
        { skill: "Core Engineering", score: 85, benchmark: 75 },
        { skill: "Architecture", score: 80, benchmark: 70 },
        { skill: "Code Speed", score: 82, benchmark: 72 },
        { skill: "Communication", score: 88, benchmark: 68 },
        { skill: "System Design", score: 78, benchmark: 75 },
      ],
    };

    setTimeout(() => {
      addCandidate(newCand);
      setIsLoading(false);
      toast({
        title: "Candidate Profile Added",
        description: `${name} has been enrolled in the talent pipeline.`,
        type: "success",
      });
      setName("");
      setEmail("");
      setBio("");
      onOpenChange(false);
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col max-h-[83vh]">
        <div className="shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>Add New Candidate</DialogTitle>
                <DialogDescription>
                  Create a candidate profile to initiate baseline behavioral tracking and interview scheduling.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 px-0.5 -mx-0.5 pb-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel required>Full Name</FieldLabel>
                <IconInput
                  icon={<User className="h-4 w-4" />}
                  type="text"
                  required
                  placeholder="e.g. Jordan Miller"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <FieldHint>Enter the candidate's legal name.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Email</FieldLabel>
                <IconInput
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  required
                  placeholder="jordan.miller@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FieldHint>We'll send interview invitations to this email.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Applied Role</FieldLabel>
                <IconInput
                  icon={<Briefcase className="h-4 w-4" />}
                  type="text"
                  required
                  value={appliedRole}
                  onChange={(e) => setAppliedRole(e.target.value)}
                />
                <FieldHint>Select the role the candidate applied for.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Location</FieldLabel>
                <IconInput
                  icon={<MapPin className="h-4 w-4" />}
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <FieldHint>Candidate's current location or preferred work setup.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Experience (Years)</FieldLabel>
                <IconInput
                  icon={<BarChart3 className="h-4 w-4" />}
                  type="number"
                  min={0}
                  max={35}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                />
                <FieldHint>Total professional experience.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Skills (Comma separated)</FieldLabel>
                <IconInput
                  icon={<Tag className="h-4 w-4" />}
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
                <FieldHint>Add key technical skills.</FieldHint>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Bio / Experience Summary</FieldLabel>
              <div className="flex items-stretch w-full rounded-lg border border-input bg-background overflow-hidden focus-within:border-foreground/40 transition-colors">
                <span className="flex items-start justify-center pt-2.5 px-3 bg-muted/60 text-muted-foreground shrink-0">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="relative flex-1 min-w-0">
                  <textarea
                    rows={3}
                    maxLength={BIO_MAX}
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                    placeholder="Brief engineering background or past company experience..."
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-6 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                  <span className="absolute bottom-1.5 right-3 text-[11px] text-muted-foreground">
                    {bio.length}/{BIO_MAX}
                  </span>
                </div>
              </div>
              <FieldHint>Give a quick summary to help interviewers prepare.</FieldHint>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {isLoading ? "Adding…" : "Add Candidate"}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}