# real-pendulum-2

Monorepo for inverted-pendulum hardware control: Teknic ClearPath motor over gRPC, a TypeScript control API (tRPC), and a React web UI with rail jog. Architecture details are in [`docs/TECHDOC.md`](docs/TECHDOC.md).

---

## Prerequisites

- **Node.js** (npm workspaces).
- **Windows**, **Teknic ClearView SDK**, SC4-HUB, and a ClearPath-SC motor for real motion.
- **CMake** and **Visual Studio 2022** (C++ desktop workload) to build `teknic_motor.dll`.  
  You do **not** need CMake on `PATH`: `npm run build:native` runs a helper that looks for `cmake.exe` under Visual Studio, standalone CMake installs, or you can set **`CMAKE_BIN`** to your `cmake.exe` path.
- Teknic **sFoundation** libraries: build `sFoundation20.sln` from the SDK (Release **x64**) so `sFoundation20.lib` / `sFoundation20.dll` exist under the SDK’s `sFoundation Source\sFoundation\win\Release\x64` (or matching Debug paths). Without this, linking the native DLL fails.
- **Vendor C++ examples** (MotionVelocity, PositionMoves, etc.):  
  `C:\Program Files (x86)\Teknic\ClearView\sdk\beta-cpp-examples-windows`  
  — closest match for rail jog is **MotionVelocity** (`MoveVelStart`). More detail under **Vendor SDK reference** in [`docs/TECHDOC.md`](docs/TECHDOC.md).

---

## Install dependencies

From the repository root:

```bash
npm install
```

### Tests

```bash
npm test
```

Runs **Vitest** for **`@real-pendulum/control-api`** (unit tests, **in-process fake `MotorService`** integration tests, contract fixtures) and **`web`** (`jogMath`, **`JogControls`**). No Teknic hardware required.

**End-to-end (Playwright)** — **`npm run build`** then:

| Command | Stack |
|---------|--------|
| **`npm run test:e2e`** | Fake **MotorService** + **control-api** + **Vite** on isolated ports (**50552** / **14001** / **4174**, see **`playwright.config.cjs`**) — default CI/local smoke, no hardware. |
| **`npm run test:e2e:real`** | Real **motor service** (Teknic DLL) + **control-api** + **Vite** on dev ports from **`.env`** (defaults **50051** / **4000** / **5173**). Build native first: **`npm run build:native -w @real-pendulum/motor-service`**, ClearView closed, same as a normal bench run. Extra spec **`e2e/motor-api-real.spec.ts`** (skipped in fake E2E) runs connect → status → short jog + stop → disconnect. |

UI mode: **`npm run test:e2e:ui`**, **`npm run test:e2e:real:ui`** — or **`npx playwright test --ui`** (Playwright is local to **`node_modules`**, not on PATH globally).

Optional env: **`E2E_USE_REAL_MOTOR=1`** selects the real stack (same as **`test:e2e:real`** scripts via **`cross-env`**).

**CI** (GitHub Actions): Ubuntu — **`npm test`**, **`npm run build`**, **`npm run test:e2e`** (Chromium); Windows — optional **`teknic_motor.dll`** build when the Teknic SDK is present — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`docs/testing-strategy.md`](docs/testing-strategy.md).

**Manual bench pass** after native/motion changes: [`docs/hardware-smoke-checklist.md`](docs/hardware-smoke-checklist.md).

**Windows optional DLL smoke** (after building `teknic_motor.dll`):  
`npm run check:dll -w @real-pendulum/motor-service`

### Environment variables (repository root)

Copy **`.env.example`** to **`.env`** in the **repository root** (same directory as the root `package.json`). Put ports (**`MOTOR_GRPC_PORT`**, **`CONTROL_API_PORT`**, **`VITE_DEV_PORT`**), optional **`TEKNIC_DLL`** (custom **`teknic_motor.dll`** path), and optional **`VITE_*`** there. **Teknic motion limits are not env-driven** — edit **`TeknicCfg`** in `apps/motor-service/native/teknic_motor/teknic_cfg.h` and rebuild the DLL. **`FindComHubPorts`** only sees the **SC4-HUB** USB adapter; **motor diagnostic USB** uses a different COM — set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** ≥ 1 to **`ComHubPort(0, n)`** and skip discovery (Windows), same pattern as **`SCNetworkReport.exe`** with a COM number.

**`npm run dev`** and **`npm run dev:no-kill`** load **`.env`** then **`.env.local`** (override) via **`scripts/run-with-root-env.mjs`**. The motor, API, and web apps also read those files when started from a workspace so a single file covers the monorepo. **`.env`** and **`.env.local`** are gitignored.

---

## Motor service (gRPC) — `apps/motor-service`

Workspace npm package: **`@real-pendulum/motor-service`** (folder **`apps/motor-service`**).

Layout:

| Path | Purpose |
|------|---------|
| **`native/teknic_motor/`** | CMake → **`teknic_motor.dll`** (Teknic ClearPath / SC4-HUB). |
| **`src/server.ts`** | Node **`motor.v1.MotorService`** (**`@grpc/grpc-js`**) — entry point. |
| **`src/teknic/`** | **koffi** bindings (**`dll.ts`**) and motor-info JSON parsing (**`motorInfoFromJson.ts`**). |
| **`scripts/`** | **`build-native.mjs`** configures and builds **`teknic_motor.dll`**. |

**`npm run dev`** runs the **Node** gRPC server (**`tsx`**); **`predev`** only builds **`teknic_motor.dll`** (**`npm run build:native`**).

**Build the DLL** (from **`apps/motor-service`** or repo root **`-w @real-pendulum/motor-service`**):

```bash
npm run build:native
```

Output: **`native/build/Release/teknic_motor.dll`**.

**Native configuration (no `TEKNIC_*` environment variables for hub motion):** Edit the **`TeknicCfg`** namespace at the top of  
`apps/motor-service/native/teknic_motor/teknic_cfg.h` (and related `.cpp` modules under that folder) — **`WaitForOnline`** timeout, accel limit (**`kAccLimitRpmPerSec`**), jog clamp (**`kJogVelLimitRpm`**), enable retries, optional **`kManualComWhenDiscoveryEmpty`** (Windows: if ≥1, **`ComHubPort(0, n)`** and **skip** **`FindComHubPorts`**). If discovery is empty and manual is 0, **`kComPortScanMin`** / **`kComPortScanMax`** (default **1..25**) **probe each COM** until a port reports a ClearPath node (same as **`SCNetworkReport`** manual COM per index). Set **`kComPortScanMin = 0`** and **`kComPortScanMax = 0`** to disable COM scanning. Jog uses **`Ports(0)`** only. Rebuild **`teknic_motor.dll`** after any change.

**ClearView and this app cannot share the hub.** Quit ClearView completely before starting the **motor service**. Only one process may open the SC4-HUB serial port.

**Sanity check (no motion):** **`SCNetworkReport.exe <COM index>`** (e.g. **`5`** for COM5) only reads node info; it does not command moves. Use it for **motor diagnostic COM** or RS‑232 when **`FindComHubPorts`** (no args) finds nothing — hub discovery only enumerates the SC4‑HUB USB device.

---

## Start the stack (development)

From the **repository root**:

```bash
npm run dev
```

This runs three processes:

| Service | Role | Default URL / port |
|---------|------|---------------------|
| **motor** | `@real-pendulum/motor-service` — Node gRPC + **`teknic_motor.dll`** (koffi) | `0.0.0.0:50051` |
| **api** | tRPC HTTP API | `http://localhost:4000` (tRPC base path `/trpc/`) |
| **web** | Vite + React UI | `http://localhost:5173` |

Open **`http://localhost:5173`** in the browser. The dev server proxies **`/trpc`** to the control API. Click **Connect motor** in the UI (or call the **`Connect`** gRPC) to run **`teknic_init`** — The motor service **starts without opening the hub** so the API and web can come up even when hardware is offline. After connect, the UI shows a **Motor (network report)** panel with node index, type code/label, user ID, firmware string, serial number, and model — the same Teknic **`IInfo`** fields **`SCNetworkReport.exe`** uses for a scan (this path requires an active SDK session after **`Connect`**).

The **api** and **web** processes wait until **TCP port 50051** accepts connections (motor service is listening) before starting, so you avoid transient **ECONNREFUSED** errors during startup. If you change **`MOTOR_GRPC_PORT`** on the motor service, update the **`wait-on tcp:127.0.0.1:50051`** lines in the root **`package.json`** scripts to use the same port.

Before the concurrent processes start, **`predev`** builds **`teknic_motor.dll`** (**`npm run build:native -w @real-pendulum/motor-service`**) then frees ports **4000**, **50051**, **5173**, and **5174**. If killing those ports is undesirable, use **`npm run dev:no-kill`** (same **`build:native`**, no **`kill-port`**).

Other useful ports:

| Variable | Service |
|----------|---------|
| `MOTOR_GRPC_PORT` | gRPC listen port (default `50051`). |
| `CONTROL_API_PORT` | tRPC server (default `4000`). |
| `VITE_DEV_PORT` | Vite dev port (default `5173`; Vite uses `strictPort`). |
| `VITE_CONTROL_API_URL` | Full tRPC URL for production builds (optional; dev uses the proxy). |

---

## Production-style build

Compile TypeScript apps and the web bundle:

```bash
npm run build
```

Run compiled services individually if needed (motor: `npm run start -w @real-pendulum/motor-service`, etc.).

---

## Troubleshooting

- **`cmake.exe not found` after installing CMake**: Close and reopen the terminal (PATH is only refreshed in new sessions). If you installed “for current user only”, CMake is often under `%LOCALAPPDATA%\Programs\CMake\bin\cmake.exe` — the build script checks there; you can also set `CMAKE_BIN` to that full path. In PowerShell, do not use `where /R` (that is a **cmd** command); use `where.exe cmake` or search with `Get-ChildItem ... -Filter cmake.exe -Recurse`.
- **`Parameter(50)` / `mnErr 0x80040105` on `EnableReq`**: Usually **MSP/ClearView** vs host-applied motion parameters. This DLL uses the **MotionVelocity** sequence from **`TeknicCfg`**; adjust **`kAccLimitRpmPerSec`** (or MSP toward **factory defaults** / host-velocity-capable mode), rebuild **`teknic_motor.dll`**, reconnect.
- **`teknic_init failed (-2)`**: **`FindComHubPorts`** only detects the **SC4‑HUB** USB adapter, not **USB plugged into the motor’s diagnostic port** — both show up as COM ports, but only the hub is auto‑listed. Note the COM number in Device Manager, set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** to that index, rebuild **`teknic_motor.dll`**. Confirm with **`SCNetworkReport.exe`** plus that COM index (same manual path as Teknic). **Exit ClearView** if it holds the port.
- **Motor service exits immediately**: Run **`npm run build:native -w @real-pendulum/motor-service`** so **`teknic_motor.dll`** exists; optional **`TEKNIC_DLL`** if the DLL is not under **`native/build/Release`**. Hub power, ClearView closed, COM not in use.
- **Port already in use**: Stop other dev servers or use `dev:no-kill` and free ports manually.
