import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { env } from "./e2e/fixtures/env";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 retry even locally: with 180+ tests across 6 workers all hitting the
  // same single-container Docker backend, occasional requests exceed the
  // default expect timeout under load - a real bug fails twice, a
  // contention blip self-heals and is reported as "flaky", not "passed".
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: env.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ar-SA",
  },

  projects: [
    {
      name: "setup",
      testDir: "./e2e/setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, "e2e/.auth/admin.json"),
      },
      dependencies: ["setup"],
    },
  ],

  webServer: [
    {
      command: `npm run dev -- --mode e2e --port ${env.port} --strictPort`,
      cwd: path.resolve(import.meta.dirname, "../elwaqf-elnamy-admin-fronted"),
      url: env.baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
