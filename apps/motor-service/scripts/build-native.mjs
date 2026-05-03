/**
 * Configure and build **`teknic_motor.dll`** (Visual Studio 2022 generator, Release).
 * Loads repo **`.env`** / **`.env.local`** first so **`TEKNIC_SDK_ROOT`**, **`CMAKE_BIN`**, etc. apply.
 */
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmakeNotFoundMessage, findCmake } from "./find-cmake.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOTOR_GRPC_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MOTOR_GRPC_ROOT, "..", "..");
for (const name of [".env", ".env.local"]) {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) {
    loadEnv({ path: p, override: name === ".env.local" });
  }
}

const cmake = findCmake();
if (!cmake) {
  console.error(cmakeNotFoundMessage());
  process.exit(1);
}

console.log("[build-native] Using:", cmake);

function runCMake(args) {
  const opts = {
    stdio: "inherit",
    cwd: MOTOR_GRPC_ROOT,
  };
  if (path.isAbsolute(cmake) || cmake.endsWith(".exe")) {
    return spawnSync(cmake, args, opts);
  }
  return spawnSync(cmake, args, { ...opts, shell: process.platform === "win32" });
}

const sdkRoot = process.env.TEKNIC_SDK_ROOT;
const cmakePrefix = process.env.CMAKE_PREFIX_PATH;
const nativeSrc = path.join(MOTOR_GRPC_ROOT, "native");
const nativeBuild = path.join(MOTOR_GRPC_ROOT, "native", "build");

const configureArgs = [
  "-S",
  nativeSrc,
  "-B",
  nativeBuild,
  "-G",
  "Visual Studio 17 2022",
  "-A",
  "x64",
];
if (sdkRoot) {
  configureArgs.push(`-DTEKNIC_SDK_ROOT=${sdkRoot}`);
}
if (cmakePrefix) {
  configureArgs.push(`-DCMAKE_PREFIX_PATH=${cmakePrefix}`);
}

let r = runCMake(configureArgs);
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

r = runCMake(["--build", nativeBuild, "--config", "Release"]);
process.exit(r.status ?? 1);
