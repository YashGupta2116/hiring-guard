"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
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
} from "lucide-react";
import { usePermissions } from "@/components/auth/role-guard";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* 8. Page Header */}
      <PageHeader
        title="Question Bank"
        description="Curated technical sandbox challenges, system design topologies, and rubric criteria."
      >
        <Button
          size="sm"
          onClick={() => setGenerateModalOpen(true)}
          className="text-xs h-8 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Generate question
        </Button>
      </PageHeader>

      {/* Category Tabs & Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {["All", "Coding", "System Design", "Behavioral"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryTab(cat)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                categoryTab === cat
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search & Difficulty Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search questions, skills, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none transition-colors"
            />
          </div>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none transition-colors"
          >
            <option value="all">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="rounded-lg border border-border bg-card p-4 space-y-3 flex flex-col justify-between hover:bg-secondary/15 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={q.difficulty} size="sm" />
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {q.category}
                    </Badge>
                  </div>

                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Clock className="h-3 w-3" /> {q.expectedTimeMinutes}m
                  </span>
                </div>

                <h3 className="font-semibold text-xs text-foreground leading-snug">
                  {q.title}
                </h3>

                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                  {q.description}
                </p>

                {/* Skills & Tags */}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {q.skills.map((s) => (
                    <span
                      key={s}
                      className="bg-secondary text-foreground px-2 py-0.5 rounded text-[10px] font-medium border border-border/60"
                    >
                      {s}
                    </span>
                  ))}
                  {q.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                  {q.starterCode && (
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Code className="h-3 w-3 text-muted-foreground" /> Starter Code
                    </span>
                  )}
                  {q.testCases && (
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <CheckCircle2 className="h-3 w-3 text-sage-600 dark:text-sage-400" /> {q.testCases.length} Tests
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setScheduleModalOpen(true)}
                    disabled={!canCreateInterview}
                    className="h-6.5 text-[11px] px-2 gap-1"
                  >
                    <Calendar className="h-3 w-3" /> Use
                  </Button>

                  <button
                    onClick={() => handleDelete(q.id, q.title)}
                    className="p-1 rounded text-muted-foreground hover:text-terra-600 dark:hover:text-terra-400 hover:bg-terra-500/10 transition-colors"
                    title="Delete Question"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
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
