/**
 * Fake gRPC motor → control-api → Vite for Playwright E2E (no Teknic DLL).
 * Ports and URLs: `config.e2e` in packages/app-config/src/config.ts
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import treeKill from "tree-kill";
import { config, e2eFakeMotorGrpcUrl } from "@real-pendulum/app-config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const motorPort = config.e2e.fakeMotorGrpcPort;
const controlPort = config.e2e.fakeControlApiPort;
const webPort = config.e2e.fakeWebPort;
const motorUrl = e2eFakeMotorGrpcUrl();

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
  "serve:fake-motor",
  "-w",
  "@real-pendulum/control-api",
  "--",
  "--port",
  String(motorPort),
]);

await waitOn({
  resources: [`tcp:127.0.0.1:${motorPort}`],
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
  `[e2e-stack] Ready — http://127.0.0.1:${webPort} (motor ${motorPort}, control-api ${controlPort})`,
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
