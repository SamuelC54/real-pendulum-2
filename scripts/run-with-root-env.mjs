#!/usr/bin/env node
/**
 * Loads repository-root `.env` then `.env.local` (override), then runs the given command.
 * Used by root `npm run dev` so Teknic and other env vars live in one place.
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envPath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("run-with-root-env: pass a command, e.g. npm run dev:stack");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  shell: process.platform === "win32",
  cwd: root,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
