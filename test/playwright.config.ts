import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4317/Richman3D/";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [{
    command: "npm run build && npm run preview -- --port 4317 --strictPort",
    cwd: "..",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: "npm run dev -- --port 4318 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4318/Richman3D/",
    reuseExistingServer: false,
  }],
});
