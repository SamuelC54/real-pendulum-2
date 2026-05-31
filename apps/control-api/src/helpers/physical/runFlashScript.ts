import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRepoRoot } from "@real-pendulum/app-config/node";

const MAX_LOG = 48_000;

/** Repo root for locating `scripts/flash-sensor-firmware.ts`. */
export function sensorFirmwareRepoRoot(): string {
  return resolveRepoRoot(import.meta.url);
}

export type FlashScriptResult = {
  ok: boolean;
  /** Captured stdout/stderr from the flash script and Arduino CLI (truncated if huge). */
  log: string;
};

/**
 * Runs **`scripts/flash-sensor-firmware.ts`** with the given serial port (requires Arduino CLI on the API machine).
 */
export function runLedToggleFlash(serialPort: string): Promise<FlashScriptResult> {
  const root = sensorFirmwareRepoRoot();
  const script = join(root, "scripts", "flash-sensor-firmware.ts");
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      log: `Flash script not found at ${script}. Set config.repoRoot if control-api runs outside the monorepo.`,
    });
  }

  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = [];
    const child = spawn("npx", ["tsx", script, serialPort], {
      cwd: root,
      shell: process.platform === "win32",
    });

    child.stdout?.on("data", (d: Buffer) => {
      chunks.push(d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      chunks.push(d);
    });

    child.on("error", (err) => {
      resolvePromise({
        ok: false,
        log: err.message,
      });
    });

    child.on("close", (code) => {
      let log = Buffer.concat(chunks).toString("utf8").trim();
      if (log.length > MAX_LOG) {
        log = `${log.slice(0, MAX_LOG)}\n… (truncated)`;
      }
      if (!log) {
        log = code === 0 ? "Flash finished." : `Process exited with code ${code ?? "unknown"}.`;
      }
      resolvePromise({
        ok: code === 0,
        log,
      });
    });
  });
}
