"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GenerateQuestionModal } from "@/components/questions/generate-question-modal";
import { ScheduleModal } from "@/components/interviews/schedule-modal";
import {
  HelpCircle,
  Search,
  Plus,
  Clock,
  Code,
  Trash2,
  Calendar,
  CheckCircle2,
  X,
  Home,
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Coding", "System Design", "Behavioral"];

const CATEGORY_SLUG: Record<string, string> = {
  Coding: "coding",
  "System Design": "system-design",
  Behavioral: "behavioral",
};

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

const DIFFICULTY_STYLES: Record<string, { border: string; dot: string }> = {
  Easy: { border: "border-l-sage-500", dot: "bg-sage-500" },
  Medium: { border: "border-l-amber-500", dot: "bg-amber-500" },
  Hard: { border: "border-l-terra-500", dot: "bg-terra-500" },
};

export default function QuestionsPage() {
  const { questions, deleteQuestion } = useStore();
  const { canCreateInterview } = usePermissions();
  const { toast } = useToast();

  const [categoryTab, setCategoryTab] = useState<string>("All");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const filteredQuestions = questions.filter((q) => {
    if (categoryTab !== "All" && q.category !== categoryTab) return false;
    if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) return false;
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      const matchTitle = q.title.toLowerCase().includes(query);
      const matchDesc = q.description.toLowerCase().includes(query);
      const matchSkill = q.skills.some((s) => s.toLowerCase().includes(query));
      const matchTag = q.tags.some((t) => t.toLowerCase().includes(query));
      if (!matchTitle && !matchDesc && !matchSkill && !matchTag) return false;
    }
    return true;
  });

  const handleDelete = (id: string, title: string) => {
    deleteQuestion(id);
    toast({
      title: "Question Deleted",
      description: `"${title}" has been removed from your bank.`,
      type: "info",
    });
  };

  const hasActiveFilters =
    categoryTab !== "All" || difficultyFilter !== "all" || searchQuery.trim() !== "";

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Home className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <Link
          href="/app/dashboard"
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-neutral-300 dark:text-neutral-700">›</span>
        <span className="text-neutral-600 dark:text-neutral-400">Question Bank</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Question Bank
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Curated technical sandbox challenges, system design topologies, and rubric criteria.
          </p>
        </div>

        <Button
          onClick={() => setGenerateModalOpen(true)}
          className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs h-9"
        >
          <Plus className="h-3.5 w-3.5" /> Generate question
        </Button>
      </div>

      {/* Category tab bar with underline indicator */}
      <div className="border-b border-border flex items-center gap-5 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const active = categoryTab === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryTab(cat)}
              className={cn(
                "relative py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {/* Search + difficulty chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search questions, skills, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDifficultyFilter("all")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
              difficultyFilter === "all"
                ? "border-foreground/30 text-foreground bg-secondary"
                : "border-transparent text-muted-foreground hover:bg-secondary/50"
            )}
          >
            All
          </button>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficultyFilter(d)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                difficultyFilter === d
                  ? "border-foreground/30 text-foreground bg-secondary"
                  : "border-transparent text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", DIFFICULTY_STYLES[d].dot)} />
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {questions.length > 0 && (
        <div className="flex items-center justify-between -mt-2">
          <span className="text-[11px] text-muted-foreground">
            {filteredQuestions.length} question{filteredQuestions.length !== 1 ? "s" : ""} found
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setCategoryTab("All");
                setDifficultyFilter("all");
                setSearchQuery("");
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Questions Grid */}
      {filteredQuestions.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No questions found"
          description="Try broadening your filter criteria or generate a question tailored to your role."
          actionLabel="Generate question"
          onAction={() => setGenerateModalOpen(true)}
          secondaryActionLabel={searchQuery ? "Clear search" : undefined}
          onSecondaryAction={() => setSearchQuery("")}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredQuestions.map((q) => {
            const allTags = [...q.skills, ...q.tags.map((t) => `#${t}`)];
            const visibleTags = allTags.slice(0, 5);
            const extraTagCount = allTags.length - visibleTags.length;
            const diffStyle = DIFFICULTY_STYLES[q.difficulty] ?? { border: "border-l-border" };

            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-lg border border-border border-l-4 bg-card p-5 flex flex-col justify-between transition-colors hover:border-foreground/20",
                  diffStyle.border
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <StatusBadge status={q.difficulty} size="sm" />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        // {CATEGORY_SLUG[q.category] ?? q.category.toLowerCase()}
                      </span>
                    </div>

                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono shrink-0">
                      <Clock className="h-3.5 w-3.5" /> {q.expectedTimeMinutes}m
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-foreground leading-snug mt-3">
                    {q.title}
                  </h3>

                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-1.5">
                    {q.description}
                  </p>

                  {/* Skills & Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                    {q.skills.map((s) => (
                      <span
                        key={s}
                        className="bg-secondary text-foreground px-2.5 py-1 rounded-md text-[11px] font-medium border border-border/60"
                      >
                        {s}
                      </span>
                    ))}
                    {q.tags.slice(0, Math.max(0, 5 - q.skills.length)).map((t) => (
                      <span
                        key={t}
                        className="text-[11px] text-muted-foreground bg-secondary/40 px-2 py-1 rounded-md"
                      >
                        #{t}
                      </span>
                    ))}
                    {extraTagCount > 0 && (
                      <span className="text-[11px] text-muted-foreground px-1.5 py-1">
                        +{extraTagCount} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                    {q.starterCode && (
                      <span className="flex items-center gap-1.5 font-mono">
                        <Code className="h-3.5 w-3.5" /> Starter Code
                      </span>
                    )}
                    {q.testCases && (
                      <span className="flex items-center gap-1.5 font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" /> {q.testCases.length} Tests
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScheduleModalOpen(true)}
                      disabled={!canCreateInterview}
                      className="h-7 text-xs px-3 gap-1.5"
                    >
                      <Calendar className="h-3.5 w-3.5" /> Use
                    </Button>

                    <button
                      onClick={() => handleDelete(q.id, q.title)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors"
                      title="Delete Question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <GenerateQuestionModal
        open={generateModalOpen}
        onOpenChange={setGenerateModalOpen}
      />
      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
      />
    </div>
  );
}