import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-CA",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "bun run start" : "bun run dev",
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
