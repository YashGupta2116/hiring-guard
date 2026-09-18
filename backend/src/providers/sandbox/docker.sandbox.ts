import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Docker from "dockerode";
import { SANDBOX_LIMITS, type ExecutionRequest, type ExecutionResult, type SandboxProvider, type TestResult } from "./sandbox.provider.js";

type LanguageRunner = {
  image: string;
  solutionFile: string;
  harnessFile: string;
  /** Renders the harness script text; solutionFile and tests.json sit next to it in /sandbox. */
  harness: (timeLimitMs: number) => string;
  command: (harnessFile: string) => string[];
};

/** One subprocess per test case, run from inside a single container for the whole request (spec 7.9: "one container per run"). */
const PYTHON_HARNESS = (timeLimitMs: number): string => `
import json, subprocess, sys, time
with open("/sandbox/tests.json") as f:
    tests = json.load(f)
results = []
for t in tests:
    start = time.time()
    try:
        proc = subprocess.run(["python3", "/sandbox/solution.py"], input=t["input"], capture_output=True, text=True, timeout=${(timeLimitMs / 1000).toFixed(3)})
        results.append({"stdout": proc.stdout, "stderr": proc.stderr, "exitCode": proc.returncode, "durationMs": int((time.time() - start) * 1000), "timedOut": False})
    except subprocess.TimeoutExpired as e:
        results.append({"stdout": (e.stdout or ""), "stderr": "Timed out.", "exitCode": None, "durationMs": ${timeLimitMs}, "timedOut": True})
print(json.dumps(results))
`;

const NODE_HARNESS = (timeLimitMs: number): string => `
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const tests = JSON.parse(fs.readFileSync("/sandbox/tests.json", "utf8"));
const results = tests.map((t) => {
  const start = Date.now();
  const proc = spawnSync("node", ["/sandbox/solution.js"], { input: t.input, encoding: "utf8", timeout: ${timeLimitMs} });
  const timedOut = proc.error?.code === "ETIMEDOUT" || proc.signal === "SIGTERM";
  return {
    stdout: proc.stdout ?? "",
    stderr: timedOut ? "Timed out." : (proc.stderr ?? ""),
    exitCode: proc.status,
    durationMs: Date.now() - start,
    timedOut,
  };
});
console.log(JSON.stringify(results));
`;

const LANGUAGE_RUNNERS: Record<string, LanguageRunner> = {
  python: {
    image: "python:3.12-alpine",
    solutionFile: "solution.py",
    harnessFile: "harness.py",
    harness: PYTHON_HARNESS,
    command: (harnessFile) => ["python3", `/sandbox/${harnessFile}`],
  },
  python3: {
    image: "python:3.12-alpine",
    solutionFile: "solution.py",
    harnessFile: "harness.py",
    harness: PYTHON_HARNESS,
    command: (harnessFile) => ["python3", `/sandbox/${harnessFile}`],
  },
  javascript: {
    image: "node:20-alpine",
    solutionFile: "solution.js",
    harnessFile: "harness.js",
    harness: NODE_HARNESS,
    command: (harnessFile) => ["node", `/sandbox/${harnessFile}`],
  },
  node: {
    image: "node:20-alpine",
    solutionFile: "solution.js",
    harnessFile: "harness.js",
    harness: NODE_HARNESS,
    command: (harnessFile) => ["node", `/sandbox/${harnessFile}`],
  },
};

type HarnessResult = { stdout: string; stderr: string; exitCode: number | null; durationMs: number; timedOut: boolean };

/** Real per-run Docker container: no network, read-only root, resource-capped (spec 7.9). */
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private readonly docker = new Docker();
  private readonly pulledImages = new Set<string>();

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const runner = LANGUAGE_RUNNERS[request.language];
    if (!runner) {
      return { status: "ERROR", results: [], stdout: "", stderr: `Unsupported language: ${request.language}`, exitCode: null, durationMs: 0 };
    }

    await this.ensureImage(runner.image);
    const dir = await mkdtemp(join(tmpdir(), "veritrust-sandbox-"));
    const start = Date.now();
    try {
      await writeFile(join(dir, runner.solutionFile), request.code, "utf8");
      await writeFile(join(dir, runner.harnessFile), runner.harness(request.timeLimitMs), "utf8");
      await writeFile(join(dir, "tests.json"), JSON.stringify(request.tests.map((t) => ({ input: t.input }))), "utf8");

      const stdout = await this.runContainer(runner, dir, request.timeLimitMs);
      const harnessResults = JSON.parse(stdout) as HarnessResult[];

      const results: TestResult[] = harnessResults.map((r, index) => ({
        index,
        passed: !r.timedOut && r.exitCode === 0 && r.stdout.trim() === request.tests[index]!.expectedOutput.trim(),
        actualOutput: r.stdout,
        expectedOutput: request.tests[index]!.expectedOutput,
      }));

      const anyTimedOut = harnessResults.some((r) => r.timedOut);
      const anyError = harnessResults.some((r) => !r.timedOut && r.exitCode !== 0);
      const status = anyTimedOut ? "TIMEOUT" : anyError ? "ERROR" : results.every((r) => r.passed) ? "PASSED" : "FAILED";

      return {
        status,
        results,
        stdout: harnessResults.map((r) => r.stdout).join(""),
        stderr: harnessResults.map((r) => r.stderr).join(""),
        exitCode: harnessResults.at(-1)?.exitCode ?? null,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sandbox execution failed.";
      return { status: "ERROR", results: [], stdout: "", stderr: message, exitCode: null, durationMs: Date.now() - start };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async ensureImage(image: string): Promise<void> {
    if (this.pulledImages.has(image)) return;
    const existing = await this.docker.listImages({ filters: JSON.stringify({ reference: [image] }) });
    if (existing.length === 0) {
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
      });
    }
    this.pulledImages.add(image);
  }

  private async runContainer(runner: LanguageRunner, dir: string, timeLimitMs: number): Promise<string> {
    const container = await this.docker.createContainer({
      Image: runner.image,
      Cmd: runner.command(runner.harnessFile),
      WorkingDir: "/sandbox",
      Tty: true,
      Env: ["PYTHONDONTWRITEBYTECODE=1"],
      HostConfig: {
        Binds: [`${dir}:/sandbox:ro`],
        Memory: SANDBOX_LIMITS.memoryBytes,
        NanoCpus: SANDBOX_LIMITS.cpus * 1_000_000_000,
        PidsLimit: SANDBOX_LIMITS.pids,
        NetworkMode: "none",
        ReadonlyRootfs: SANDBOX_LIMITS.readOnlyRootFs,
        Tmpfs: { "/tmp": "size=16m" },
      },
    });

    try {
      await container.start();
      // Wall-clock kill above the per-test timeout budget so a hung harness itself can't outlive the run.
      const overallTimeoutMs = timeLimitMs * 20 + 10_000;
      const waited = await Promise.race([
        container.wait().then(() => "exited" as const),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), overallTimeoutMs)),
      ]);
      if (waited === "timeout") {
        await container.kill().catch(() => undefined);
        throw new Error("Sandbox container exceeded its overall wall-clock limit.");
      }
      // `follow: true` forces docker-modem down its raw-stream path. Without it, a non-stream logs
      // response gets speculatively JSON.parse'd by docker-modem itself — harmless for ordinary text,
      // but our harness's stdout *is* JSON, so `logs()` would hand back a parsed array/object instead
      // of a Buffer and `.toString()` on that silently produced "[object Object]" garbage.
      const stream = await container.logs({ stdout: true, stderr: true, follow: true });
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      await container.remove({ force: true }).catch(() => undefined);
    }
  }
}
