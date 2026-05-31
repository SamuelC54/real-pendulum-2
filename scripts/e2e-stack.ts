/**
 * Simulation (physics-sim + controller-service) → control-api → Vite for Playwright E2E.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";
import {
  config,
  e2ePhysicsSimHttpUrl,
  e2eControllerServiceHttpUrl,
} from "@real-pendulum/app-config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const physicsSimDir = path.join(root, "apps/physics-sim");
const controllerServiceDir = path.join(root, "apps/controller-service");
const physicsPort = config.e2e.physicsSimHttpPort;
const controllerPort = config.e2e.controllerServiceHttpPort;
const controlPort = config.e2e.controlApiPort;
const webPort = config.e2e.simWebPort;
const physicsUrl = e2ePhysicsSimHttpUrl();
const controllerUrl = e2eControllerServiceHttpUrl();

const children: ChildProcess[] = [];

function launch(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): ChildProcess {
  const child = spawn(command, args, {
    cwd: options?.cwd ?? root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...options?.env },
  });
  children.push(child);
  return child;
}

launch("python", ["-m", "cart_pendulum.server", "--port", String(physicsPort)], {
  cwd: physicsSimDir,
});

await waitOn({
  resources: [`tcp:127.0.0.1:${physicsPort}`],
  timeout: 60_000,
});

launch("python", ["-m", "controller_service.server", "--port", String(controllerPort)], {
  cwd: controllerServiceDir,
});

await waitOn({
  resources: [`tcp:127.0.0.1:${controllerPort}`],
  timeout: 60_000,
});

launch("npm", [
  "run",
  "start:tsx",
  "-w",
  "@real-pendulum/control-api",
  "--",
  "--port",
  String(controlPort),
],
  {
    env: {
      PHYSICS_SIM_URL: physicsUrl,
      CONTROLLER_SERVICE_URL: controllerUrl,
    },
  },
);

await waitOn({
  resources: [`tcp:127.0.0.1:${controlPort}`],
  timeout: 60_000,
});

launch("npm", [
  "run",
  "dev",
  "-w",
  "web",
  "--",
  "--mode",
  "e2e",
  "--port",
  String(webPort),
  "--strictPort",
  "--host",
  "127.0.0.1",
]);

await waitOn({
  resources: [`http-get://127.0.0.1:${webPort}/`],
  timeout: 180_000,
});

console.log(
  `[e2e-stack] Ready — http://127.0.0.1:${webPort} (physics ${physicsPort}, controllers ${controllerPort}, control-api ${controlPort})`,
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
