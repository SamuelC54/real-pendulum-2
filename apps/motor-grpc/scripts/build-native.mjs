/**
 * Finds CMake when it is not on PATH (common on Windows with VS-installed CMake only).
 * Honors CMAKE_BIN to force a specific cmake.exe.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOTOR_GRPC_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MOTOR_GRPC_ROOT, "..", "..");
for (const name of [".env", ".env.local"]) {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) {
    loadEnv({ path: p, override: name === ".env.local" });
  }
}

function runCMake(args) {
  const opts = {
    stdio: "inherit",
    cwd: MOTOR_GRPC_ROOT,
  };
  // Bare `cmake` needs shell on Windows so PATH is searched; absolute paths must not use shell (breaks quoting).
  if (path.isAbsolute(cmake) || cmake.endsWith(".exe")) {
    return spawnSync(cmake, args, opts);
  }
  return spawnSync(cmake, args, { ...opts, shell: process.platform === "win32" });
}

/** Prefer execFileSync on Windows — reliable for full paths to cmake.exe. */
function cmakeWorks(exe) {
  try {
    execFileSync(exe, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Windows: PATH often omits VS-bundled CMake; `where cmake` sometimes still finds it. */
function cmakeFromWhere() {
  if (process.platform !== "win32") return null;
  const r = spawnSync("where.exe", ["cmake"], {
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  const first = r.stdout.trim().split(/\r?\n/).filter(Boolean)[0];
  if (first && fs.existsSync(first)) return first;
  return null;
}

function installationPathFromVsWhere() {
  const pf86 = process.env["ProgramFiles(x86)"];
  if (!pf86) return null;
  const vswhere = path.join(pf86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!fs.existsSync(vswhere)) return null;
  const r = spawnSync(vswhere, ["-latest", "-products", "*", "-property", "installationPath"], {
    encoding: "utf8",
  });
  if (r.status !== 0 || !r.stdout) return null;
  const p = r.stdout.trim().split(/\r?\n/)[0];
  return p && fs.existsSync(p) ? p : null;
}

function findCmake() {
  const envBin = process.env.CMAKE_BIN;
  if (envBin && fs.existsSync(envBin) && cmakeWorks(envBin)) {
    return envBin;
  }

  if (cmakeWorks("cmake")) {
    return "cmake";
  }

  const fromWhere = cmakeFromWhere();
  if (fromWhere && cmakeWorks(fromWhere)) {
    return fromWhere;
  }

  const vsInstall = installationPathFromVsWhere();
  const vsCandidates = [];
  if (vsInstall) {
    vsCandidates.push(
      path.join(
        vsInstall,
        "Common7",
        "IDE",
        "CommonExtensions",
        "Microsoft",
        "CMake",
        "CMake",
        "bin",
        "cmake.exe",
      ),
    );
  }

  const localPrograms = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Programs", "CMake", "bin", "cmake.exe")
    : null;

  const staticCandidates = [
    ...vsCandidates,
    ...(localPrograms ? [localPrograms] : []),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "CMake", "bin", "cmake.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "CMake", "bin", "cmake.exe"),
    process.env.ProgramW6432
      ? path.join(process.env.ProgramW6432, "CMake", "bin", "cmake.exe")
      : null,
    "C:\\Program Files\\CMake\\bin\\cmake.exe",
    "C:\\Program Files (x86)\\CMake\\bin\\cmake.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe",
  ];

  for (const p of staticCandidates) {
    if (!p) continue;
    if (!fs.existsSync(p)) continue;
    if (cmakeWorks(p)) return path.normalize(p);
  }

  return null;
}

const cmake = findCmake();
if (!cmake) {
  console.error(
    [
      "[build-native] cmake.exe not found.",
      "",
      "If you just installed CMake from cmake.org:",
      '  • Choose “Add CMake to the system PATH” in the installer, OR restart the terminal (PATH updates).',
      "  • Per-user installs often land here (check this path exists):",
      `    ${path.join(process.env.LOCALAPPDATA || "%LOCALAPPDATA%", "Programs", "CMake", "bin", "cmake.exe")}`,
      "",
      "Or set the full path explicitly for this session:",
      '  PowerShell:  $env:CMAKE_BIN = "C:\\Program Files\\CMake\\bin\\cmake.exe"',
      "",
      "Find cmake.exe in PowerShell (not cmd’s `where`, which is aliased):",
      "  Get-ChildItem -Path $env:LOCALAPPDATA\\Programs, \"C:\\Program Files\" -Filter cmake.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 FullName",
      "",
      "Then: set CMAKE_BIN to that path, or add its folder to your user PATH.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("[build-native] Using:", cmake);

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
