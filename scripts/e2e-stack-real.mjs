/**
 * Starts **`@real-pendulum/motor-service`** (Teknic DLL) → **control-api** → **Vite dev** for Playwright against real hardware.
 *
 * Prerequisites: **`teknic_motor.dll`** (**`build:native`**) + Node motor service, hub powered, ClearView closed — same as **`npm run dev`**.
 *
 * Environment (inherits repo `.env` via child processes): **`MOTOR_GRPC_PORT`**, **`CONTROL_API_PORT`**,
 * **`E2E_WEB_PORT`** / **`VITE_DEV_PORT`** for the web dev server port.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const motorPort = process.env.MOTOR_GRPC_PORT ?? "50051";
const controlPort = process.env.CONTROL_API_PORT ?? "4000";
const webPort =
  process.env.E2E_WEB_PORT ?? process.env.VITE_DEV_PORT ?? "5173";

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

launch("npm", ["run", "start", "-w", "@real-pendulum/motor-service"], {
  env: { MOTOR_GRPC_PORT: motorPort },
});

await waitOn({
  resources: [`tcp:127.0.0.1:${motorPort}`],
  timeout: 120_000,
});

launch("npm", ["run", "start:tsx", "-w", "@real-pendulum/control-api"], {
  env: {
    MOTOR_GRPC_URL: `http://127.0.0.1:${motorPort}`,
    CONTROL_API_PORT: controlPort,
  },
});

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
  `[e2e-stack-real] Ready — web http://127.0.0.1:${webPort} (motor tcp ${motorPort}, control-api ${controlPort})`,
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
