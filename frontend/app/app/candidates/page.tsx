"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CandidateAvatar } from "@/components/ui/candidate-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AddCandidateModal } from "@/components/candidates/add-candidate-modal";
import {
  Users,
  Search,
  UserPlus,
  Star,
  ChevronRight,
} from "lucide-react";

export default function CandidatesPage() {
  const { candidates } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const filteredCandidates = candidates.filter((cand) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = cand.name.toLowerCase().includes(q);
      const matchRole = cand.appliedRole.toLowerCase().includes(q);
      const matchEmail = cand.email.toLowerCase().includes(q);
      const matchSkill = cand.skills.some((s) => s.toLowerCase().includes(q));
      if (!matchName && !matchRole && !matchEmail && !matchSkill) return false;
    }
    if (statusFilter !== "all" && cand.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* 8. Page Header */}
      <PageHeader
        title="Candidates"
        description="Candidate directory, aggregated evaluation benchmarks, and behavioral baseline profiles."
      >
        <Button
          size="sm"
          onClick={() => setAddModalOpen(true)}
          className="text-xs h-8 gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add candidate
        </Button>
      </PageHeader>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search candidates by name, skill, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          >
            <option value="all">All Stages</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interviewing">Interviewing</option>
            <option value="Under Review">Under Review</option>
            <option value="Hired">Hired</option>
          </select>
        </div>
      </div>

      {/* 14. Candidates Table */}
      {filteredCandidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates found"
          description={
            searchQuery
              ? `No candidate profiles matched "${searchQuery}". Try clearing your filters.`
              : "No candidates yet. Add your first candidate to start tracking interview performance."
          }
          actionLabel="Add candidate"
          onAction={() => setAddModalOpen(true)}
          secondaryActionLabel={searchQuery ? "Clear search" : undefined}
          onSecondaryAction={() => setSearchQuery("")}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-border bg-secondary/35 text-muted-foreground font-medium text-[11px]">
              <tr>
                <th className="px-3.5 py-2.5">Candidate</th>
                <th className="px-3.5 py-2.5">Email</th>
                <th className="px-3.5 py-2.5">Role</th>
                <th className="px-3.5 py-2.5">Interviews</th>
                <th className="px-3.5 py-2.5">Last Interview</th>
                <th className="px-3.5 py-2.5">Average Score</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredCandidates.map((cand) => (
                <tr
                  key={cand.id}
                  className="hover:bg-secondary/40 transition-colors"
                >
                  {/* Candidate */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CandidateAvatar
                        src={cand.avatar}
                        name={cand.name}
                        size="md"
                      />
                      <span className="font-serif font-semibold text-foreground text-xs">
                        {cand.name}
                      </span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-3.5 py-2.5 text-muted-foreground text-[11px]">
                    {cand.email}
                  </td>

                  {/* Role */}
                  <td className="px-3.5 py-2.5 font-medium text-foreground text-xs">
                    {cand.appliedRole}
                  </td>

                  {/* Interviews */}
                  <td className="px-3.5 py-2.5 text-foreground whitespace-nowrap text-xs">
                    <span className="font-serif font-semibold">{cand.interviewsTaken}</span>
                  </td>

                  {/* Last Interview */}
                  <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap text-[11px]">
                    {cand.lastInterviewDate || "—"}
                  </td>

                  {/* Average Score */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-serif font-semibold text-foreground text-xs">
                        {cand.averageScore > 0 ? `${cand.averageScore}%` : "—"}
                      </span>
                      {cand.averageScore >= 85 && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3.5 py-2.5">
                    <StatusBadge status={cand.status} size="sm" />
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <Link href={`/app/candidates/${cand.id}`}>
                      <Button size="sm" variant="ghost" className="h-6.5 text-[11px] px-2 gap-1">
                        Profile <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCandidateModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
