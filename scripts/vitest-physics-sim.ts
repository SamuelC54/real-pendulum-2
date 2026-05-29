import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHYSICS_SIM_DIR = path.resolve(__dirname, "../apps/physics-sim");
/** Isolated port so dev physics-sim on 58871 does not shadow test server code. */
const TEST_PORT = 58971;
const PHYSICS_SIM_URL = `http://127.0.0.1:${TEST_PORT}`;

let proc: ChildProcess | null = null;

async function physicsSimHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${PHYSICS_SIM_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await physicsSimHealthy()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    "physics-sim did not become ready. Install deps: pip install -r apps/physics-sim/requirements.txt",
  );
}

export async function setup(): Promise<void> {
  process.env.PHYSICS_SIM_URL = PHYSICS_SIM_URL;

  if (await physicsSimHealthy()) return;

  proc = spawn("python", ["-m", "cart_pendulum.server", "--port", String(TEST_PORT)], {
    cwd: PHYSICS_SIM_DIR,
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  proc.on("error", (err) => {
    console.error("[vitest-physics-sim] failed to spawn:", err.message);
  });

  await waitForReady(15_000);
}

export async function teardown(): Promise<void> {
  if (!proc) return;
  proc.kill();
  proc = null;
}
