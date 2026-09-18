"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { createCandidate } from "@/lib/api/candidates";
import { ApiError } from "@/lib/api/client";
import { useToast } from "../ui/toast";
import { UserPlus, User, Mail, Briefcase, MapPin, BarChart3, Tag, FileText, Phone } from "lucide-react";

interface AddCandidateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the candidate is saved, so the caller can refresh its list. */
  onCreated?: () => void;
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

export function AddCandidateModal({ open, onOpenChange, onCreated }: AddCandidateModalProps) {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [location, setLocation] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [skills, setSkills] = useState("");
  const [bio, setBio] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setAppliedRole("");
    setLocation("");
    setExperienceYears("");
    setSkills("");
    setBio("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const saved = await createCandidate({
        email: email.trim(),
        name: name.trim(),
        appliedRole: appliedRole.trim() || undefined,
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        experienceYears: experienceYears === "" ? undefined : Number(experienceYears),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        bio: bio.trim() || undefined,
      });
      toast({
        title: "Candidate saved",
        description: `${saved.name ?? saved.email} is in your talent pipeline.`,
        type: "success",
      });
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length > 0) {
        setError(err.fields.map((f) => `${f.path}: ${f.message}`).join(" · "));
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save the candidate. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
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
                <FieldLabel>Phone</FieldLabel>
                <IconInput
                  icon={<Phone className="h-4 w-4" />}
                  type="tel"
                  placeholder="+1 555 0100"
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <FieldHint>Optional contact number.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Applied Role</FieldLabel>
                <IconInput
                  icon={<Briefcase className="h-4 w-4" />}
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineer"
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
                  placeholder="e.g. Berlin, Germany"
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
                  max={60}
                  placeholder="e.g. 5"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                />
                <FieldHint>Total professional experience.</FieldHint>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Skills (Comma separated)</FieldLabel>
                <IconInput
                  icon={<Tag className="h-4 w-4" />}
                  type="text"
                  placeholder="e.g. TypeScript, React, Go"
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

          {error && (
            <div role="alert" className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

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