#!/usr/bin/env node
/**
 * Preflight before `docker compose up` — fail fast with a clear message when Docker is unavailable.
 */
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32" });
}

const version = run("docker", ["version", "--format", "{{.Server.Version}}"]);
if (version.status !== 0) {
  const detail = (version.stderr || version.stdout || "").trim();
  console.error(`
Docker is not running or not installed.

  Windows: start Docker Desktop and wait until it says "Docker Desktop is running".
  macOS:   open Docker Desktop from Applications.
  Linux:   sudo systemctl start docker

Then run:  npm run dev

Native stack without Docker:  npm run dev:local
`);
  if (detail) {
    console.error(`docker version: ${detail.split("\n")[0]}\n`);
  }
  process.exit(1);
}

const compose = run("docker", ["compose", "version", "--short"]);
if (compose.status !== 0) {
  console.error("Docker Compose plugin not found. Update Docker Desktop or install docker-compose-plugin.\n");
  process.exit(1);
}

/** Warn when a standalone Portainer install would block compose ports or container name. */
const portainerInspect = run("docker", ["inspect", "portainer"]);
if (portainerInspect.status === 0) {
  let composeProject = "";
  try {
    composeProject =
      JSON.parse(portainerInspect.stdout)[0]?.Config?.Labels?.[
        "com.docker.compose.project"
      ] ?? "";
  } catch {
    /* treat as external */
  }
  if (composeProject !== "real-pendulum") {
    console.error(`
A Portainer container named "portainer" already exists outside this compose stack.

Stop it before npm run dev (this stack includes Portainer CE):

  docker stop portainer
  docker rm portainer

Or use your existing Portainer at https://localhost:9443 and remove the portainer
service from docker-compose.yml.
`);
    process.exit(1);
  }
}
