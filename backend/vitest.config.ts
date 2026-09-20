import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    // Integration tests share one real Postgres/Redis and truncate tables in beforeEach;
    // running test files in parallel races those resets against each other's fixtures.
    fileParallelism: false,
    // Do not set `isolate: false`, however tempting the runner's own speed hint is.
    // `tests/integration/calibrated-weights.test.ts` sets CALIBRATED_WEIGHTS_ENABLED in a
    // `vi.hoisted` block and relies on a per-file module registry to contain it. Sharing modules
    // across files would both defeat that (config is read once, by whichever file loads first)
    // and leak calibrated LLRs into every other suite, which asserts on the hand-set values.
  },
});
