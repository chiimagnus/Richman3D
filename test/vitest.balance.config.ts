import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/simulation/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 1_800_000,
  },
});
