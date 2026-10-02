import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["test/e2e/**", "test/fixtures/**"],
    passWithNoTests: false,
  },
});
