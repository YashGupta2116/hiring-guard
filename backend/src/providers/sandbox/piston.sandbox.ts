import type { ExecutionRequest, ExecutionResult, SandboxProvider, TestResult } from "./sandbox.provider.js";

// Public, free, open-source code-execution API (https://github.com/engineer-man/piston). Code runs
// in Piston's own isolated containers on their infrastructure, never on this server, so there is no
// Docker-socket / host-compromise tradeoff to accept for a real sandbox.
const PISTON_EXECUTE_URL = "https://emkc.org/api/v2/piston/execute";

const LANGUAGE_RUNTIMES: Record<string, { language: string; version: string; filename: string }> = {
  python: { language: "python", version: "3.10.0", filename: "solution.py" },
  python3: { language: "python", version: "3.10.0", filename: "solution.py" },
  javascript: { language: "javascript", version: "18.15.0", filename: "solution.js" },
  node: { language: "javascript", version: "18.15.0", filename: "solution.js" },
};

type PistonRunResult = { stdout: string; stderr: string; code: number | null; signal: string | null };
type PistonResponse = { compile?: PistonRunResult; run?: PistonRunResult; message?: string };

export class PistonSandboxProvider implements SandboxProvider {
  readonly name = "piston";

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const runtime = LANGUAGE_RUNTIMES[request.language];
    if (!runtime) {
      return { status: "ERROR", results: [], stdout: "", stderr: `Unsupported language: ${request.language}`, exitCode: null, durationMs: 0 };
    }

    const start = Date.now();
    const results: TestResult[] = [];
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let anyTimedOut = false;
    let anyError = false;

    // One request per test case, same shape as the Docker sandbox's "one subprocess per test".
    // Piston has no persistent-container concept to reuse across calls, and a public rate limit
    // (5 req/s per IP) that a single candidate's test run comfortably stays under.
    for (const test of request.tests) {
      let body: PistonResponse;
      try {
        const response = await fetch(PISTON_EXECUTE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            language: runtime.language,
            version: runtime.version,
            files: [{ name: runtime.filename, content: request.code }],
            stdin: test.input,
            run_timeout: request.timeLimitMs,
          }),
        });
        if (!response.ok) throw new Error(`Piston responded ${response.status}`);
        body = (await response.json()) as PistonResponse;
      } catch (err) {
        anyError = true;
        stderr = err instanceof Error ? err.message : "Piston request failed.";
        results.push({ index: results.length, passed: false, actualOutput: "", expectedOutput: test.expectedOutput });
        continue;
      }

      if (body.compile && body.compile.code !== 0) {
        anyError = true;
        stderr = body.compile.stderr;
        results.push({ index: results.length, passed: false, actualOutput: "", expectedOutput: test.expectedOutput });
        continue;
      }

      const run = body.run;
      if (!run) {
        anyError = true;
        stderr = body.message ?? "Piston returned no run result.";
        results.push({ index: results.length, passed: false, actualOutput: "", expectedOutput: test.expectedOutput });
        continue;
      }

      // Piston kills the process with SIGKILL when run_timeout is exceeded.
      const timedOut = run.signal === "SIGKILL";
      if (timedOut) anyTimedOut = true;
      else if (run.code !== 0) anyError = true;

      stdout = run.stdout;
      stderr = run.stderr;
      exitCode = run.code;

      results.push({
        index: results.length,
        passed: !timedOut && run.code === 0 && run.stdout.trim() === test.expectedOutput.trim(),
        actualOutput: run.stdout,
        expectedOutput: test.expectedOutput,
      });
    }

    const status = anyTimedOut ? "TIMEOUT" : anyError ? "ERROR" : results.every((r) => r.passed) ? "PASSED" : "FAILED";
    return { status, results, stdout, stderr, exitCode, durationMs: Date.now() - start };
  }
}
