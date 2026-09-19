import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionRequest, ExecutionResult, SandboxProvider, TestResult } from "./sandbox.provider.js";

const MAX_OUTPUT_BYTES = 64 * 1024;

type Runner = { file: string; command: () => string; args: (file: string) => string[] };

const RUNNERS: Record<string, Runner> = {
  python: { file: "solution.py", command: () => (process.platform === "win32" ? "python" : "python3"), args: (f) => [f] },
  javascript: { file: "solution.js", command: () => process.execPath, args: (f) => [f] },
};
RUNNERS.python3 = RUNNERS.python!;
RUNNERS.node = RUNNERS.javascript!;

type RunOutcome = { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean };

function runOnce(runner: Runner, cwd: string, input: string, timeLimitMs: number): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(runner.command(), runner.args(runner.file), { cwd, env: { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", PYTHONDONTWRITEBYTECODE: "1" }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeLimitMs);
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `Could not start the ${runner.command()} runtime: ${err.message}`, exitCode: null, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: timedOut ? "Timed out." : stderr, exitCode: code, timedOut });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

/**
 * Really runs the candidate's code with the host's Python / Node, one process per test case, and compares
 * trimmed stdout with the expected output. It has a time limit but NO isolation (no container, network or
 * filesystem limits), so use it for local development only; production should use the Docker sandbox.
 */
export class LocalSandboxProvider implements SandboxProvider {
  readonly name = "local";

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const runner = RUNNERS[request.language];
    if (!runner) {
      return { status: "ERROR", results: [], stdout: "", stderr: `Unsupported language: ${request.language}`, exitCode: null, durationMs: 0 };
    }
    if (request.code.trim().length === 0) {
      return { status: "ERROR", results: [], stdout: "", stderr: "No code submitted.", exitCode: 1, durationMs: 1 };
    }

    const dir = await mkdtemp(join(tmpdir(), "veritrust-local-"));
    const start = Date.now();
    try {
      await writeFile(join(dir, runner.file), request.code, "utf8");
      // With no test cases, run once so syntax and runtime errors still surface.
      const inputs = request.tests.length > 0 ? request.tests : [{ input: "", expectedOutput: "" }];
      const outcomes: RunOutcome[] = [];
      for (const test of inputs) outcomes.push(await runOnce(runner, dir, test.input, request.timeLimitMs));

      const results: TestResult[] =
        request.tests.length === 0
          ? []
          : outcomes.map((o, index) => ({
              index,
              passed: !o.timedOut && o.exitCode === 0 && o.stdout.trim() === request.tests[index]!.expectedOutput.trim(),
              actualOutput: o.stdout,
              expectedOutput: request.tests[index]!.expectedOutput,
            }));

      const anyTimedOut = outcomes.some((o) => o.timedOut);
      const anyError = outcomes.some((o) => !o.timedOut && o.exitCode !== 0);
      const status = anyTimedOut ? "TIMEOUT" : anyError ? "ERROR" : results.every((r) => r.passed) ? "PASSED" : "FAILED";
      return {
        status,
        results,
        stdout: outcomes.map((o) => o.stdout).join(""),
        stderr: outcomes.map((o) => o.stderr).join(""),
        exitCode: outcomes.at(-1)?.exitCode ?? null,
        durationMs: Date.now() - start,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
