import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/accounts", fullyParallel: false, workers: 1, retries: 0,
  forbidOnly: Boolean(process.env.CI), timeout: 90000, expect: { timeout: 15000 },
  outputDir: ".codex-test-results/accounts", reporter: [["./e2e/accounts/sanitized-reporter.ts"]],
  use: { baseURL: "http://localhost:3105", browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 }, locale: "es-MX", colorScheme: "light", actionTimeout: 15000, trace: "off", video: "off", screenshot: "off" },
});
