/**
 * Configure and build **`teknic_motor.dll`** (Visual Studio generator, Release).
 * Native build paths: **`packages/app-config/src/config.ts`** (`motor` section).
 *
 * **Windows:** tries **`Visual Studio 17 2022`** then **`Visual Studio 18 2026`** (wipes **`native/build`**
 * between attempts). Override **`motor.cmakeGenerator`** in config.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
import { cmakeNotFoundMessage, findCmake } from "./find-cmake.mjs";

register();
const { config } = await import("@real-pendulum/app-config");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOTOR_GRPC_ROOT = path.resolve(__dirname, "..");

const cmake = findCmake({ cmakeBin: config.motor.cmakeBin?.trim() });
if (!cmake) {
  console.error(cmakeNotFoundMessage());
  process.exit(1);
}

console.log("[build-native] Using:", cmake);

function runCMake(args) {
  const opts = {
    stdio: "inherit",
    cwd: MOTOR_GRPC_ROOT,
    shell: false,
  };
  return spawnSync(cmake, args, opts);
}

const sdkRoot = config.motor.teknicSdkRoot?.trim();
const cmakePrefix = config.motor.cmakePrefixPath?.trim();
const nativeSrc = path.join(MOTOR_GRPC_ROOT, "native");
const nativeBuild = path.join(MOTOR_GRPC_ROOT, "native", "build");

const customGen = config.motor.cmakeGenerator?.trim();
const generators = customGen
  ? [customGen]
  : ["Visual Studio 17 2022", "Visual Studio 18 2026"];

let lastStatus = 1;
for (let i = 0; i < generators.length; i++) {
  const gen = generators[i];
  if (i > 0) {
    console.log("[build-native] Configure failed; clearing", nativeBuild, "and retrying with:", gen);
    fs.rmSync(nativeBuild, { recursive: true, force: true });
  }
  const configureArgs = ["-S", nativeSrc, "-B", nativeBuild, "-G", gen, "-A", "x64"];
  if (sdkRoot) {
    configureArgs.push(`-DTEKNIC_SDK_ROOT=${sdkRoot}`);
  }
  if (cmakePrefix) {
    configureArgs.push(`-DCMAKE_PREFIX_PATH=${cmakePrefix}`);
  }
  lastStatus = runCMake(configureArgs).status ?? 1;
  if (lastStatus === 0) {
    if (generators.length > 1) {
      console.log("[build-native] CMake -G", JSON.stringify(gen));
    }
    break;
  }
}
if (lastStatus !== 0) {
  process.exit(lastStatus);
}

const r = runCMake(["--build", nativeBuild, "--config", "Release"]);
process.exit(r.status ?? 1);
