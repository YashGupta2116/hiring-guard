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
import { Question } from "@/lib/types";
import { useToast } from "../ui/toast";
import { Wand2, BrainCircuit, Code, Layers } from "lucide-react";

interface GenerateQuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogHeader>
        <div className="flex items-center gap-2 text-foreground">
          <Wand2 className="h-4 w-4" />
          <DialogTitle>Generate Question with AI Assistant</DialogTitle>
        </div>
        <DialogDescription>
          Synthesize custom technical or behavioral interview challenges tailored to your domain and seniority tier.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Target Subject / Topic</label>
          <input
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Distributed Consensus, React Fiber reconciler, Kafka offset management"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            >
              <option value="Coding">Coding Sandbox</option>
              <option value="System Design">System Design</option>
              <option value="Behavioral">Behavioral / Leadership</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:border-foreground/40 focus-visible:outline-none transition-colors"
            >
              <option value="Easy">Easy (Junior / Screen)</option>
              <option value="Medium">Medium (Mid-level)</option>
              <option value="Hard">Hard (Senior / Staff)</option>
            </select>
          </div>
        </div>

        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> What the AI generates:
          </div>
          <p>• Detailed problem statement with constraints and edge cases</p>
          <p>• Starter code snippets (TypeScript & Python) with test cases</p>
          <p>• Multi-point evaluation rubric for interviewers</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="default" isLoading={isGenerating}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Synthesize Question
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
