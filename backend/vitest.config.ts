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
  },
});
