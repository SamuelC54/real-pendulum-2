/**
 * Starts fake gRPC motor → control-api (tsx) → Vite dev for Playwright E2E (no Teknic DLL).
 * Environment: **`MOTOR_GRPC_PORT`**, **`CONTROL_API_PORT`**, **`E2E_WEB_PORT`** (see `playwright.config.cjs` defaults).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const motorPort = process.env.MOTOR_GRPC_PORT ?? "50051";
const controlPort = process.env.CONTROL_API_PORT ?? "4000";
const webPort = process.env.E2E_WEB_PORT ?? "4173";

const children = [];

function launch(command, args, options) {
  const child = spawn(command, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...options?.env },
  });
  children.push(child);
  return child;
}

launch("npm", ["run", "serve:fake-motor", "-w", "@real-pendulum/control-api"], {
  env: { MOTOR_GRPC_PORT: motorPort },
});

await waitOn({
  resources: [`tcp:127.0.0.1:${motorPort}`],
  timeout: 60_000,
});

launch(
  "npm",
  ["run", "start:tsx", "-w", "@real-pendulum/control-api"],
  {
    env: {
      MOTOR_GRPC_URL: `127.0.0.1:${motorPort}`,
      CONTROL_API_PORT: controlPort,
    },
  },
);

await waitOn({
  resources: [`tcp:127.0.0.1:${controlPort}`],
  timeout: 60_000,
});

launch("npm", ["run", "dev", "-w", "web", "--", "--port", webPort, "--strictPort", "--host", "127.0.0.1"], {
  env: {
    ...process.env,
    VITE_CONTROL_API_URL: `http://127.0.0.1:${controlPort}/trpc`,
  },
});

await waitOn({
  resources: [`http-get://127.0.0.1:${webPort}/`],
  timeout: 180_000,
});

console.log(
  `[e2e-stack] Ready — preview http://127.0.0.1:${webPort} (motor tcp ${motorPort}, control-api ${controlPort})`,
);

function shutdown() {
  for (const p of children) {
    if (p.pid) {
      treeKill(p.pid, "SIGTERM", () => {});
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
