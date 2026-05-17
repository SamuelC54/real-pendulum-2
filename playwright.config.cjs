require("tsx/cjs");

const { config } = require("./packages/app-config/src/config.ts");
const { defineConfig, devices } = require("@playwright/test");

const useRealMotor = config.e2e.useRealMotor;
const ci = config.e2e.continuousIntegration;

const webPort = useRealMotor
  ? config.e2e.webPort ?? config.web.devPort
  : config.e2e.simWebPort;

const baseURL = `http://127.0.0.1:${webPort}`;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: useRealMotor ? 240_000 : 60_000,
  fullyParallel: !useRealMotor,
  forbidOnly: ci,
  retries: ci && !useRealMotor ? 2 : 0,
  workers: ci || useRealMotor ? 1 : undefined,
  reporter: ci ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: useRealMotor
      ? "npx tsx scripts/e2e-stack-real.ts"
      : "npx tsx scripts/e2e-stack.ts",
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 240_000,
  },
});
