/**
 * Smoke-checks that `teknic_motor.dll` exists (optional paths) and can be loaded with koffi.
 * Does not call `teknic_init` (no USB/hub access). Non-Windows: exits 0 (skip).
 *
 * Run from package root: `npx tsx scripts/check-teknic-dll.ts`
 */
import { resolveTeknicDll, loadTeknic } from "../src/teknicNative.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform !== "win32") {
  console.log("[check-teknic-dll] Skip on non-Windows.");
  process.exit(0);
}

const motorGrpcSrc = path.resolve(__dirname, "../src");
const dllPath = resolveTeknicDll(motorGrpcSrc);

if (!dllPath) {
  console.log("[check-teknic-dll] No DLL found — build with npm run build:native or set TEKNIC_DLL.");
  process.exit(0);
}

try {
  loadTeknic(dllPath);
  console.log(`[check-teknic-dll] OK — loaded ${dllPath}`);
  process.exit(0);
} catch (e) {
  console.error("[check-teknic-dll] Failed to load DLL:", e);
  process.exit(1);
}
