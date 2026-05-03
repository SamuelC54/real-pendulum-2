/**
 * Configure and build **`teknic_motor.dll`** (Visual Studio generator, Release).
 * Loads repo **`.env`** / **`.env.local`** first so **`TEKNIC_SDK_ROOT`**, **`CMAKE_BIN`**, etc. apply.
 *
 * **Windows:** tries **`Visual Studio 17 2022`** then **`Visual Studio 18 2026`** (wipes **`native/build`**
 * between attempts). Override with **`CMAKE_GENERATOR`** (e.g. only VS 18 on your machine).
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
    // Never use shell: true here — on Windows, cmd.exe splits -G "Visual Studio 17 2022"
    // into -G Visual / Studio / 17 / 2022 and CMake sees generator "Visual" only.
    shell: false,
  };
  return spawnSync(cmake, args, opts);
}

const sdkRoot = process.env.TEKNIC_SDK_ROOT;
const cmakePrefix = process.env.CMAKE_PREFIX_PATH;
const nativeSrc = path.join(MOTOR_GRPC_ROOT, "native");
const nativeBuild = path.join(MOTOR_GRPC_ROOT, "native", "build");

const customGen = process.env.CMAKE_GENERATOR?.trim();
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
