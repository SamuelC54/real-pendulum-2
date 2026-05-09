import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@real-pendulum/motor-service/sdk": path.resolve(__dirname, "../motor-service/src/sdk/index.ts"),
      "@real-pendulum/sensor-service/sdk": path.resolve(__dirname, "../sensor-service/src/sdk/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
