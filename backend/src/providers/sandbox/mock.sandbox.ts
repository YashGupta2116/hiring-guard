import type { ExecutionRequest, ExecutionResult, SandboxProvider } from "./sandbox.provider.js";

/**
 * Does NOT run code. Empty code returns ERROR; otherwise every test passes so flows can be demoed.
 * Replaced by the Docker sandbox in Phase 8.
 */
export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock";

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (request.code.trim().length === 0) {
      return { status: "ERROR", results: [], stdout: "", stderr: "No code submitted.", exitCode: 1, durationMs: 1 };
    }
    return {
      status: "PASSED",
      results: request.tests.map((test, index) => ({ index, passed: true, actualOutput: test.expectedOutput, expectedOutput: test.expectedOutput })),
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 5,
    };
  }
}
