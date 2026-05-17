/**
 * Coupled sim (physics-sim + MuJoCo) → control-api → Vite for Playwright E2E (no Teknic DLL).
 * Ports: `config.e2e` in packages/app-config/src/config.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";
import {
  config,
  e2eCoupledGrpcUrl,
  e2ePhysicsSimHttpUrl,
} from "@real-pendulum/app-config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const physicsSimDir = path.join(root, "apps/physics-sim");
const physicsPort = config.e2e.physicsSimHttpPort;
const coupledPort = config.e2e.coupledGrpcPort;
const controlPort = config.e2e.controlApiPort;
const webPort = config.e2e.simWebPort;
const coupledUrl = e2eCoupledGrpcUrl();
const physicsUrl = e2ePhysicsSimHttpUrl();

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

launch(
  "npm",
  ["run", "serve:coupled-sim", "-w", "@real-pendulum/motor-service", "--", "--port", String(coupledPort)],
  { env: { PHYSICS_SIM_URL: physicsUrl } },
);

await waitOn({
  resources: [`tcp:127.0.0.1:${coupledPort}`],
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
  "--motor-grpc-url",
  coupledUrl,
  "--sensor-grpc-url",
  coupledUrl,
]);

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
  `[e2e-stack] Ready — http://127.0.0.1:${webPort} (physics ${physicsPort}, coupled ${coupledPort}, control-api ${controlPort})`,
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
