#!/usr/bin/env node
/**
 * Smoke-check: **teknic_motor.dll** exists under native/build (no hardware access).
 * Non-Windows: exits 0 (skip).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");

if (process.platform !== "win32") {
  console.log("[check:dll] Skip on non-Windows.");
  process.exit(0);
}

const candidates = [
  path.join(pkgRoot, "native", "build", "Release", "teknic_motor.dll"),
  path.join(pkgRoot, "native", "build", "Debug", "teknic_motor.dll"),
];

for (const p of candidates) {
  if (fs.existsSync(p)) {
    console.log(`[check:dll] OK — ${p}`);
    process.exit(0);
  }
}

console.log("[check:dll] No DLL found — run npm run build:native.");
process.exit(0);
