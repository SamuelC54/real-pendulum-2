#!/usr/bin/env node
/**
 * Pre-pull Portainer CE LTS before compose up (retries transient Docker Hub EOF errors).
 */
import { spawnSync } from "node:child_process";

const IMAGE = "portainer/portainer-ce:lts";
const MAX_ATTEMPTS = 5;
const RETRY_MS = 4000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pullOnce() {
  const r = spawnSync("docker", ["pull", IMAGE], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

async function main() {
  const inspect = spawnSync("docker", ["image", "inspect", IMAGE], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (inspect.status === 0) {
    console.log(`[portainer] Image present: ${IMAGE}`);
    return;
  }

  console.log(`[portainer] Pulling ${IMAGE}…`);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { ok, err } = pullOnce();
    if (ok) {
      console.log(`[portainer] Pull succeeded.`);
      return;
    }
    const line = err.split("\n").find(Boolean) ?? err;
    console.warn(`[portainer] Pull attempt ${attempt}/${MAX_ATTEMPTS} failed: ${line}`);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_MS * attempt);
    }
  }

  console.error(`
Failed to pull ${IMAGE} after ${MAX_ATTEMPTS} attempts.

  • Check network / VPN / Docker Desktop registry access
  • Retry manually:  docker pull ${IMAGE}
  • Then:            npm run dev
`);
  process.exit(1);
}

await main();
