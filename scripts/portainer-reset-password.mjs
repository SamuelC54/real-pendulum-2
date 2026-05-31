#!/usr/bin/env node
/**
 * Reset Portainer admin password — must stop Portainer first (BoltDB single-writer).
 *
 *   npm run dev:portainer-reset-password
 *   PORTAINER_ADMIN_PASSWORD=secret npm run dev:portainer-reset-password
 */
import { spawnSync } from "node:child_process";

const PASSWORD = process.env.PORTAINER_ADMIN_PASSWORD ?? "pass";
const WAIT_MS = 3000;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
}

function docker(...args) {
  return run("docker", args);
}

function compose(args, opts = {}) {
  const list = Array.isArray(args) ? args : [args];
  return run("docker", ["compose", ...list], opts);
}

function isRunning(name) {
  const r = docker("inspect", "-f", "{{.State.Running}}", name);
  return r.status === 0 && r.stdout.trim() === "true";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[portainer] Stopping Portainer (releases portainer.db lock)…");
  compose(["stop", "portainer"]);

  // Remove stale one-off reset containers that may still hold the volume.
  for (const name of ["rp-portainer-reset-password"]) {
    if (docker("inspect", name).status === 0) {
      docker("rm", "-f", name);
    }
  }

  if (isRunning("portainer")) {
    console.error("[portainer] Portainer is still running. Try: docker compose stop portainer");
    process.exit(1);
  }

  console.log(`[portainer] Waiting ${WAIT_MS / 1000}s for database lock to clear…`);
  await wait(WAIT_MS);

  console.log("[portainer] Resetting admin password…");
  const reset = compose(
    ["--profile", "portainer-reset", "run", "--rm", "portainer-reset-password"],
    { env: { ...process.env, PORTAINER_ADMIN_PASSWORD: PASSWORD } },
  );

  if (reset.status !== 0) {
    console.error((reset.stderr || reset.stdout || "").trim());
    console.error(`
Password reset failed. Ensure Portainer is stopped and no other container uses portainer_data:

  docker compose stop portainer
  docker ps -a --filter volume=real-pendulum_portainer_data
`);
    process.exit(reset.status ?? 1);
  }

  console.log((reset.stdout || "").trim());
  console.log("[portainer] Password reset complete. Starting Portainer…");
  const start = compose(["start", "portainer"]);
  if (start.status !== 0) {
    console.warn("[portainer] Start Portainer manually: docker compose start portainer");
  } else {
    console.log("[portainer] Login: admin /", PASSWORD);
  }
}

await main();
