import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "test/simulation/**"],
    passWithNoTests: false,
  },
});
