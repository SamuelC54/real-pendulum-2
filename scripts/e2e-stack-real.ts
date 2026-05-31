/**
 * Motor-service (Teknic) → control-api → Vite for Playwright against real hardware.
 * Ports: `config` + `config.e2e` in packages/app-config/src/config.ts
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";
import { config, e2eRealWebPort, motorGrpcBaseUrl } from "@real-pendulum/app-config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const motorPort = config.motor.grpcPort;
const controlPort = config.controlApi.port;
const webPort = e2eRealWebPort();
const motorUrl = motorGrpcBaseUrl();

const children: ReturnType<typeof spawn>[] = [];

function launch(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  children.push(child);
  return child;
}

launch("npm", [
  "run",
  "start",
  "-w",
  "@real-pendulum/physical-motor-service",
  "--",
  "--port",
  String(motorPort),
]);

await waitOn({
  resources: [`tcp:127.0.0.1:${motorPort}`],
  timeout: 120_000,
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
  motorUrl,
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
  "e2e-real",
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
  `[e2e-stack-real] Ready — http://127.0.0.1:${webPort} (motor ${motorPort}, control-api ${controlPort})`,
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
