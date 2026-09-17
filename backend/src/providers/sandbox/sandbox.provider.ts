export type TestCase = {
  input: string;
  expectedOutput: string;
};

export type ExecutionRequest = {
  language: string;
  code: string;
  tests: TestCase[];
  timeLimitMs: number;
};

export type TestResult = {
  index: number;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
};

export type ExecutionResult = {
  status: "PASSED" | "FAILED" | "ERROR" | "TIMEOUT";
  results: TestResult[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};

/** Hard limits every real sandbox implementation must enforce (spec 7.9). */
export const SANDBOX_LIMITS = {
  memoryBytes: 256 * 1024 * 1024,
  cpus: 1,
  pids: 128,
  network: false,
  readOnlyRootFs: true,
} as const;

export interface SandboxProvider {
  readonly name: string;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
