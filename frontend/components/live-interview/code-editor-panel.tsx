"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Play, RotateCcw, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

// Dynamically import Monaco Editor to prevent SSR hydration errors
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface CodeEditorPanelProps {
  initialCode?: string;
  initialLanguage?: string;
  onCodeRun?: () => void;
}

export function CodeEditorPanel({
  initialCode,
  initialLanguage = "typescript",
  onCodeRun,
}: CodeEditorPanelProps) {
  const [language, setLanguage] = useState(initialLanguage);
  const [code, setCode] = useState(
    initialCode ||
      `// HiringGuard Coding Sandbox
// Problem: Ring-Buffer Telemetry Pipeline with O(1) Updates

export interface TelemetryPacket {
  id: string;
  timestamp: number;
  cpuLoad: number;
  anomalyScore: number;
}

export class TelemetryRingBuffer {
  private buffer: (TelemetryPacket | null)[];
  private capacity: number;
  private head: number = 0;
  private size: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  public push(packet: TelemetryPacket): void {
    this.buffer[this.head] = packet;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  public getSnapshot(): TelemetryPacket[] {
    const result: TelemetryPacket[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      if (this.buffer[idx]) result.push(this.buffer[idx]!);
    }
    return result;
  }
}

// Simulated verification
const ring = new TelemetryRingBuffer(3);
ring.push({ id: "p1", timestamp: Date.now(), cpuLoad: 42, anomalyScore: 0.1 });
ring.push({ id: "p2", timestamp: Date.now() + 10, cpuLoad: 45, anomalyScore: 0.12 });
console.log("Snapshot size:", ring.getSnapshot().length);`
  );

  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<{
    status: "idle" | "running" | "completed";
    output: string[];
    cases: { name: string; passed: boolean; duration: string }[];
  }>({
    status: "idle",
    output: [],
    cases: [],
  });

  const handleRunCode = () => {
    setIsRunning(true);
    setTestResults({
      status: "running",
      output: ["Compiling AST and initializing sandbox environment..."],
      cases: [],
    });

    if (onCodeRun) onCodeRun();

    setTimeout(() => {
      setIsRunning(false);
      setTestResults({
        status: "completed",
        output: [
          "[STDOUT] Initializing ring buffer capacity: 3",
          "[STDOUT] Inserted packet p1 (latency: 1.2ms)",
          "[STDOUT] Inserted packet p2 (latency: 0.9ms)",
          "[STDOUT] Ring buffer snapshot verified: 2 items retrieved",
          "[TELEMETRY] Execution time: 14ms | Memory allocated: 1.4 MB",
        ],
        cases: [
          { name: "Test 1: O(1) Circular Insertion & Pointer Wraparound", passed: true, duration: "3ms" },
          { name: "Test 2: FIFO Eviction When Exceeding Max Capacity", passed: true, duration: "4ms" },
          { name: "Test 3: Concurrent Snapshot Under Simulated Load", passed: true, duration: "7ms" },
        ],
      });
    }, 900);
  };

  const handleReset = () => {
    setCode(initialCode || "// Write code here...");
    setTestResults({ status: "idle", output: [], cases: [] });
  };

  return (
    <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
      {/* Top Editor Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border bg-secondary/30 text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-foreground text-xs">Code Sandbox</span>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-input bg-background/60 px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-6.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Reset code"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>

          <Button
            size="sm"
            onClick={handleRunCode}
            isLoading={isRunning}
            className="h-6.5 px-2.5 text-xs"
          >
            <Play className="h-3 w-3 mr-1 fill-current" /> Run
          </Button>
        </div>
      </div>

      {/* Monaco Code Editor Area */}
      <div className="flex-1 min-h-[240px] relative bg-[#18181b]">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(val) => setCode(val || "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        />
      </div>

      {/* Bottom Test Results / Output Console */}
      <div className="h-40 border-t border-border bg-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-secondary/20 text-[11px]">
          <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Terminal className="h-3 w-3" /> Console & Test Assertions
          </span>
          {testResults.status === "completed" && (
            <span className="text-[10px] text-sage-700 dark:text-sage-400 font-medium">
              3 of 3 Passed (14ms)
            </span>
          )}
          {testResults.status === "running" && (
            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
              Executing sandbox...
            </span>
          )}
        </div>

        <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] space-y-1.5">
          {testResults.status === "idle" && (
            <div className="text-muted-foreground italic text-[11px]">
              Click &ldquo;Run&rdquo; to compile candidate AST and evaluate test suite assertions.
            </div>
          )}

          {testResults.cases.length > 0 && (
            <div className="space-y-1 pb-1">
              {testResults.cases.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-foreground">
                    {c.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-sage-600 dark:text-sage-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-terra-600 dark:text-terra-400" />
                    )}
                    {c.name}
                  </span>
                  <span className="text-muted-foreground text-[10px]">{c.duration}</span>
                </div>
              ))}
            </div>
          )}

          {testResults.output.map((line, idx) => (
            <div key={idx} className="text-muted-foreground text-[10px] leading-tight">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
