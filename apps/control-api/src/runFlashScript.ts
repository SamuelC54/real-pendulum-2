import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LOG = 48_000;

/** Repo root: **`REPO_ROOT`** env, else three levels up from this file (`apps/control-api/src`). */
export function sensorFirmwareRepoRoot(): string {
  const fromEnv = process.env.REPO_ROOT?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../..");
}

export type FlashScriptResult = {
  ok: boolean;
  /** Captured stdout/stderr from the flash script and Arduino CLI (truncated if huge). */
  log: string;
};

/**
 * Runs **`scripts/flash-led-toggle.mjs`** with the given serial port (requires Arduino CLI on the API machine).
 */
export function runLedToggleFlash(serialPort: string): Promise<FlashScriptResult> {
  const root = sensorFirmwareRepoRoot();
  const script = join(root, "scripts", "flash-led-toggle.mjs");
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      log: `Flash script not found at ${script}. Set REPO_ROOT to your repo root if control-api runs elsewhere.`,
    });
  }

  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = [];
    const child = spawn(process.execPath, [script, serialPort], {
      cwd: root,
      env: process.env,
      shell: false,
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
