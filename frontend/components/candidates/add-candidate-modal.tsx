"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useStore } from "@/lib/store/interview-store";
import { Candidate } from "@/lib/types";
import { useToast } from "../ui/toast";
import { UserPlus, Mail, Briefcase, MapPin } from "lucide-react";

interface AddCandidateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogHeader>
        <div className="flex items-center gap-2 text-foreground">
          <UserPlus className="h-4 w-4" />
          <DialogTitle>Add New Candidate</DialogTitle>
        </div>
        <DialogDescription>
          Create a candidate profile to initiate baseline behavioral tracking and interview scheduling.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Jordan Miller"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Email</label>
            <input
              type="email"
              required
              placeholder="jordan.miller@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Applied Role</label>
            <input
              type="text"
              required
              value={appliedRole}
              onChange={(e) => setAppliedRole(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Experience (Years)</label>
            <input
              type="number"
              min={0}
              max={35}
              value={experienceYears}
              onChange={(e) => setExperienceYears(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Skills (Comma separated)</label>
            <input
              type="text"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Bio / Experience Summary</label>
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Brief engineering background or past company experience..."
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors resize-none"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="default" isLoading={isLoading}>
            Add Candidate
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
