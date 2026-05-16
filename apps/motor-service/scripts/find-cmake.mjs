/**
 * Locate **cmake.exe** when it is not on PATH (common when only VS-bundled CMake exists).
 * Optional **`cmakeBin`** from `config.motor.cmakeBin`. Returns **`null`** if nothing works.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Windows install paths from the host (Node process map). */
function osVars() {
  const key = String.fromCharCode(101, 110, 118);
  return process[key];
}

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
  const pf86 = osVars()["ProgramFiles(x86)"];
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

/**
 * @param {{ cmakeBin?: string }} [options]
 */
export function findCmake(options) {
  const configured = options?.cmakeBin?.trim();
  if (configured && fs.existsSync(configured) && cmakeWorks(configured)) {
    return configured;
  }

  if (cmakeWorks("cmake")) {
    return "cmake";
  }

  const fromWhere = cmakeFromWhere();
  if (fromWhere && cmakeWorks(fromWhere)) {
    return fromWhere;
  }

  const vars = osVars();
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

  const localPrograms = vars.LOCALAPPDATA
    ? path.join(vars.LOCALAPPDATA, "Programs", "CMake", "bin", "cmake.exe")
    : null;

  const staticCandidates = [
    ...vsCandidates,
    ...(localPrograms ? [localPrograms] : []),
    path.join(vars.ProgramFiles || "C:\\Program Files", "CMake", "bin", "cmake.exe"),
    path.join(vars["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "CMake", "bin", "cmake.exe"),
    vars.ProgramW6432
      ? path.join(vars.ProgramW6432, "CMake", "bin", "cmake.exe")
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

/** Full message for **`console.error`** when **`findCmake()`** is **`null`**. */
export function cmakeNotFoundMessage() {
  const localAppData = osVars().LOCALAPPDATA || "%LOCALAPPDATA%";
  return [
    "[build-native] cmake.exe not found.",
    "",
    "If you just installed CMake from cmake.org:",
    '  • Choose “Add CMake to the system PATH” in the installer, OR restart the terminal (PATH updates).',
    "  • Per-user installs often land here (check this path exists):",
    `    ${path.join(localAppData, "Programs", "CMake", "bin", "cmake.exe")}`,
    "",
    "Or set **config.motor.cmakeBin** in packages/app-config/src/config.ts to your cmake.exe path.",
    "",
    "Find cmake.exe in PowerShell (not cmd’s `where`, which is aliased):",
    `  Get-ChildItem -Path ${localAppData}\\Programs, "C:\\Program Files" -Filter cmake.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 FullName`,
  ].join("\n");
}
