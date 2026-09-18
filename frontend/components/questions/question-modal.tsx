"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { useToast } from "../ui/toast";
import { ApiError } from "@/lib/api/client";
import { DIFFICULTIES, type DifficultyCode } from "@/lib/api/coding-tasks";
import { createQuestion, updateQuestion, type BankQuestion } from "@/lib/api/question-bank";

interface QuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null adds a new question. */
  question: BankQuestion | null;
  onSaved: () => void;
}

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 transition-colors";
const labelClass = "text-xs font-semibold text-foreground";

function QuestionForm({ question, onCancel, onDone }: { question: BankQuestion | null; onCancel: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState(question?.text ?? "");
  const [topic, setTopic] = useState(question?.topic ?? "");
  const [skills, setSkills] = useState(question?.skills.join(", ") ?? "");
  const [difficulty, setDifficulty] = useState<DifficultyCode>(question?.difficulty ?? "MEDIUM");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      text: text.trim(),
      topic: topic.trim(),
      difficulty,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      if (question) await updateQuestion(question.id, payload);
      else await createQuestion(payload);
      toast({ title: question ? "Question updated" : "Question added", description: "Saved to your question bank.", type: "success" });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the question.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="q-text">Question</label>
        <textarea id="q-text" required rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className={field} placeholder="What the interviewer asks the candidate." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="q-topic">Topic</label>
          <input id="q-topic" required maxLength={100} value={topic} onChange={(e) => setTopic(e.target.value)} className={field} placeholder="e.g. System design" />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="q-difficulty">Difficulty</label>
          <select id="q-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as DifficultyCode)} className={field}>
            {DIFFICULTIES.map((d) => (
              <option key={d.code} value={d.code}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="q-skills">Skills (comma separated, optional)</label>
        <input id="q-skills" value={skills} onChange={(e) => setSkills(e.target.value)} className={field} placeholder="e.g. Caching, Consistency" />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? "Saving..." : question ? "Save changes" : "Add question"}
        </button>
      </div>
    </form>
  );
}

export function QuestionModal({ open, onOpenChange, question, onSaved }: QuestionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
        <DialogDescription>
          Questions in the bank are the fallback for live interview suggestions, matched by difficulty, when the suggestion model is unavailable.
        </DialogDescription>
      </DialogHeader>
      <QuestionForm
        key={question?.id ?? "new"}
        question={question}
        onCancel={() => onOpenChange(false)}
        onDone={() => {
          onSaved();
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
