"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { useStore } from "@/lib/store/interview-store";
import { Question } from "@/lib/types";
import { useToast } from "../ui/toast";
import { Wand2, Layers, Code, BarChart3, Lightbulb, ChevronDown } from "lucide-react";

interface GenerateQuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Text input with a leading icon chip, matching the reference look. */
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

/** Select with a leading icon chip and trailing chevron, matching the reference look. */
function IconSelect({
  icon,
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { icon: React.ReactNode }) {
  return (
    <div className="flex items-stretch w-full rounded-lg border border-input bg-background overflow-hidden focus-within:border-foreground/40 transition-colors">
      <span className="flex items-center justify-center px-3 bg-muted/60 text-muted-foreground shrink-0">
        {icon}
      </span>
      <div className="relative flex-1 min-w-0">
        <select
          {...props}
          className={`w-full appearance-none bg-transparent pl-3 pr-9 py-2.5 text-sm text-foreground focus:outline-none ${className}`}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export function GenerateQuestionModal({
  open,
  onOpenChange,
}: GenerateQuestionModalProps) {
  const { addQuestion } = useStore();
  const { toast } = useToast();

  const [topic, setTopic] = useState("Distributed Consensus & Raft Leader Elections");
  const [category, setCategory] = useState<"Coding" | "System Design" | "Behavioral">("Coding");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Hard");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    setTimeout(() => {
      const generated: Question = {
        id: `q-${Date.now()}`,
        title: `Architecting ${topic}`,
        category,
        difficulty,
        skills: [topic.split(" ")[0], "Architecture", "Fault Tolerance"],
        expectedTimeMinutes: difficulty === "Hard" ? 45 : 30,
        tags: ["AI Generated", "Reliability", category],
        description: `Deep-dive problem evaluating candidate reasoning around ${topic}. Candidate should structure components, anticipate edge cases, and discuss failure handling under split-brain or network partitions.`,
        starterCode: {
          typescript: `// AI-Generated Skeleton: ${topic}\nexport async function evaluateState() {\n  // Implementation\n}`,
          python: `# AI-Generated Skeleton: ${topic}\ndef evaluate_state():\n    pass`,
        },
        testCases: [
          { input: "Standard Quorum (3/5 active)", expectedOutput: "Consensus Reached", description: "Standard heartbeat acknowledgment" },
          { input: "Partition Event (2 isolated)", expectedOutput: "Step Down to Follower", description: "Node yields leadership upon lost quorum" },
        ],
        evaluationRubric: [
          `Identifies trade-offs inherent to ${topic}`,
          "Explains algorithmic time/space implications under scale",
          "Demonstrates organic communication rather than memorized script",
        ],
      };

      addQuestion(generated);
      setIsGenerating(false);
      toast({
        title: "AI Question Generated",
        description: `"${generated.title}" has been saved to Question Bank.`,
        type: "success",
      });
      onOpenChange(false);
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col max-h-[85vh]">
        <div className="shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Generate Question with AI Assistant</DialogTitle>
                <DialogDescription>
                  Synthesize custom technical or behavioral interview challenges tailored to your domain and seniority tier.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleGenerate} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 px-0.5 -mx-0.5 pb-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Target Subject / Topic</label>
              <IconInput
                icon={<Layers className="h-4 w-4" />}
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Distributed Consensus, React Fiber reconciler, Kafka offset management"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter the main subject or topic for the question.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Category</label>
                <IconSelect
                  icon={<Code className="h-4 w-4" />}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="Coding">Coding Sandbox</option>
                  <option value="System Design">System Design</option>
                  <option value="Behavioral">Behavioral / Leadership</option>
                </IconSelect>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Difficulty</label>
                <IconSelect
                  icon={<BarChart3 className="h-4 w-4" />}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                >
                  <option value="Easy">Easy (Junior / Screen)</option>
                  <option value="Medium">Medium (Mid-level)</option>
                  <option value="Hard">Hard (Senior / Staff)</option>
                </IconSelect>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-amber-500/[0.06] p-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">What the AI generates:</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A complete, interview-ready question with problem statement, constraints,
                  starter code, test cases, and an evaluation rubric tailored to your inputs.
                </p>
              </div>
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
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {isGenerating ? "Synthesizing…" : "Synthesize Question"}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}