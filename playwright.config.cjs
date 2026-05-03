const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });

const { defineConfig, devices } = require("@playwright/test");

const useRealMotor =
  process.env.E2E_USE_REAL_MOTOR === "1" ||
  process.env.E2E_USE_REAL_MOTOR === "true";

/** Fake stack: isolated ports. Real stack: dev defaults (override via `.env`). */
if (useRealMotor) {
  process.env.MOTOR_GRPC_PORT ??= "50051";
  process.env.CONTROL_API_PORT ??= "4000";
  process.env.E2E_WEB_PORT ??= process.env.VITE_DEV_PORT ?? "5173";
} else {
  process.env.MOTOR_GRPC_PORT ??= "50552";
  process.env.CONTROL_API_PORT ??= "14001";
  process.env.E2E_WEB_PORT ??= "4174";
}

const webPort = process.env.E2E_WEB_PORT ?? "4174";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;

module.exports = defineConfig({
  testDir: "./e2e",
  /** Real motor: Connect + hub can exceed Playwright's default 30s (hook + expects). */
  timeout: useRealMotor ? 240_000 : 60_000,
  fullyParallel: !useRealMotor,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI && !useRealMotor ? 2 : 0,
  workers: process.env.CI || useRealMotor ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: useRealMotor
      ? "node scripts/e2e-stack-real.mjs"
      : "node scripts/e2e-stack.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
