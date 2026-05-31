import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@real-pendulum/physical-motor-service/sdk": path.resolve(__dirname, "../physical-motor-service/src/sdk/index.ts"),
      "@real-pendulum/physical-sensor-service/sdk": path.resolve(__dirname, "../physical-sensor-service/src/sdk/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      PHYSICS_SIM_URL: "http://127.0.0.1:58971",
    },
    globalSetup: ["../../scripts/vitest-simulation.ts"],
  },
});
