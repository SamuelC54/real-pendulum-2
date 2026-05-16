# real-pendulum-2

Monorepo for inverted-pendulum hardware control: Teknic ClearPath motor over gRPC, a TypeScript control API (tRPC), and a React web UI with rail jog. Architecture details are in [`docs/TECHDOC.md`](docs/TECHDOC.md).

---

## Prerequisites

- **Node.js** (npm workspaces).
- **Windows**, **Teknic ClearView SDK**, SC4-HUB, and a ClearPath-SC motor for real motion.
- **CMake** and a **Visual Studio** install with the **C++ desktop** workload (the native build script tries VS 2022 then VS 2026; override **`motor.cmakeGenerator`** in **`packages/app-config/src/config.ts`** if needed) to build **`teknic_motor.dll`**.  
  You do **not** need CMake on `PATH`: `npm run build:native` runs a helper that looks for `cmake.exe` under Visual Studio, standalone CMake installs, or set **`motor.cmakeBin`** in config.
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
| **`npm run test:e2e:real`** | Real **motor service** (Teknic DLL) + **control-api** + **Vite** on dev ports from **`config`** (defaults **50051** / **4000** / **5173**). Uses **`playwright.real.config.cjs`**. Build native first: **`npm run build:native -w @real-pendulum/motor-service`**, ClearView closed. Extra spec **`e2e/motor-api-real.spec.ts`** (skipped in fake E2E). |

UI mode: **`npm run test:e2e:ui`**, **`npm run test:e2e:real:ui`** — or **`npx playwright test --ui`**.

**CI** (GitHub Actions): Ubuntu — **`npm test`**, **`npm run build`**, **`npm run test:e2e:ci`** (Chromium); Windows — optional **`teknic_motor.dll`** build — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`docs/testing-strategy.md`](docs/testing-strategy.md).

**Manual bench pass** after native/motion changes: [`docs/hardware-smoke-checklist.md`](docs/hardware-smoke-checklist.md).

**Windows optional DLL smoke** (after building `teknic_motor.dll`):  
`npm run check:dll -w @real-pendulum/motor-service`

### Configuration

Edit **`packages/app-config/src/config.ts`** for ports, homing, coupled-sim tuning, Teknic native build paths, flash options, and E2E fake-stack ports (`config.e2e`). Services accept optional CLI overrides (`--port`, `--motor-grpc-url`) when spawned by scripts.

**Teknic motion limits** are in **`TeknicCfg`** (`apps/motor-service/native/teknic_motor/teknic_cfg.h`) — rebuild the DLL after changes. **`FindComHubPorts`** only sees the **SC4-HUB** USB adapter; for motor diagnostic USB set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** ≥ 1.

---

## Motor service (Connect RPC) — `apps/motor-service`

Workspace npm package: **`@real-pendulum/motor-service`** (folder **`apps/motor-service`**). Shared protobuf types live in **`packages/motor-proto`** (**`npm run proto:generate`** after **`proto/motor.proto`** changes).

Layout:

| Path | Purpose |
|------|---------|
| **`native/teknic_motor/`** | CMake → **`teknic_motor.dll`** (Teknic ClearPath / SC4-HUB). |
| **`src/server.ts`** | Node **`motor.v1.MotorService`** via [**Connect**](https://connectrpc.com/) (HTTP on **`config.motor.grpcPort`**). |
| **`src/teknic/`** | **koffi** bindings (**`dll.ts`**) for **`teknic_motor.dll`**. |
| **`scripts/`** | **`build-native.mjs`** configures and builds **`teknic_motor.dll`**. |

**`npm run dev`** runs the motor **Connect** server (**`tsx`**); **`predev`** only builds **`teknic_motor.dll`** (**`npm run build:native`**).

**Control API** talks to the motor over Connect (default **`motorGrpcBaseUrl()`** from config).

The **sensor service** (**`@real-pendulum/sensor-service`**, default port **50052** in config) talks to Arduino over USB serial. The web UI lists serial ports before **Connect**; optional fallback **`config.sensor.serialPort`**. Flash: **`npm run flash:sensor-firmware -- COM3`** (Arduino CLI; options in **`config.flash`**). UI flash waits **`config.controlApi.flashAfterDisconnectMs`** before upload.

**Build the DLL** (from **`apps/motor-service`** or repo root **`-w @real-pendulum/motor-service`**):

```bash
npm run build:native
```

Output: **`native/build/Release/teknic_motor.dll`**.

**Native configuration (hub motion in C++, not config.ts):** Edit the **`TeknicCfg`** namespace at the top of  
`apps/motor-service/native/teknic_motor/teknic_cfg.h` (and related `.cpp` modules under that folder) — **`kEnableReqOnConnect`** (1 = enable axis for jog, 0 = read-only node info, no motion), **`WaitForOnline`** timeout, accel limit (**`kAccLimitRpmPerSec`**), jog clamp (**`kJogVelLimitRpm`**), enable retries, optional **`kManualComWhenDiscoveryEmpty`** (Windows: if ≥1, **`ComHubPort(0, n)`** and **skip** **`FindComHubPorts`**). If discovery is empty and manual is 0, **`kComPortScanMin`** / **`kComPortScanMax`** (default **1..25**) **probe each COM** until a port reports a ClearPath node (same as **`SCNetworkReport`** manual COM per index). Set **`kComPortScanMin = 0`** and **`kComPortScanMax = 0`** to disable COM scanning. Jog uses **`Ports(0)`** only. Rebuild **`teknic_motor.dll`** after any change.

**ClearView and this app cannot share the hub.** Quit ClearView completely before starting the **motor service**. Only one process may open the SC4-HUB serial port.

**Sanity check (no motion):** **`SCNetworkReport.exe <COM index>`** (e.g. **`5`** for COM5) only reads node info; it does not command moves. Use it for **motor diagnostic COM** or RS‑232 when **`FindComHubPorts`** (no args) finds nothing — hub discovery only enumerates the SC4‑HUB USB device.

---

## Start the stack (development)

From the **repository root**:

```bash
npm run dev
```

This runs four processes:

| Service | Role | Default URL / port |
|---------|------|---------------------|
| **motor** | `@real-pendulum/motor-service` — Node Connect + **`teknic_motor.dll`** (koffi) | `0.0.0.0:50051` |
| **sensor** | `@real-pendulum/sensor-service` — Arduino USB serial + Connect | `0.0.0.0:50052` |
| **api** | tRPC HTTP API | `http://localhost:4000` (tRPC base path `/trpc/`) |
| **web** | Vite + React UI | `http://localhost:5173` |

Open **`http://localhost:5173`** in the browser. The dev server proxies **`/trpc`** to the control API. Click **Connect Motor Board** in the UI (or call the **`Connect`** gRPC) to run **`teknic_init`** — The motor service **starts without opening the hub** so the API and web can come up even when hardware is offline. After connect, the UI shows a **Motor Board (network report)** panel with node index, type code/label, user ID, firmware string, serial number, and model — the same Teknic **`IInfo`** fields **`SCNetworkReport.exe`** uses for a scan (this path requires an active SDK session after **`Connect`**).

The **api** and **web** processes wait until **TCP port 50051** accepts connections (motor service is listening) before starting, so you avoid transient **ECONNREFUSED** errors during startup. If you change **`MOTOR_GRPC_PORT`** on the motor service, update the **`wait-on tcp:127.0.0.1:50051`** lines in the root **`package.json`** scripts to use the same port.

Before the concurrent processes start, **`predev`** builds **`teknic_motor.dll`** (**`npm run build:native -w @real-pendulum/motor-service`**) then frees ports **4000**, **50051**, **50052**, **5173**, and **5174**. If killing those ports is undesirable, use **`npm run dev:no-kill`** (same **`build:native`**, no **`kill-port`**).

Other useful ports:

| Variable | Service |
|----------|---------|
| `MOTOR_GRPC_PORT` | Motor Connect listen port (default `50051`). |
| `SENSOR_GRPC_PORT` | Sensor Connect listen port (default `50052`). |
| `SENSOR_SERIAL_PORT` | Arduino COM/device path (required to connect serial, e.g. `COM3`). |
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
- **`0x80040105` / `Parameter(62)` / “failed to write 13333…” before `EnableReq`**: Host **`Motion.AccLimit`** ( **`kHostVelocityParamsBeforeEnable=2`** + **`kAccLimitRpmPerSec`** ) was rejected — MSP often owns limits. Use **`kHostVelocityParamsBeforeEnable=1`** ( **`VelUnit` / `AccUnit` only** , no host AccLimit) or **`0`**, tune **MSP/ClearView**, rebuild **`teknic_motor.dll`**.
- **`Parameter(50)` on `EnableReq`**: Often fixed by Teknic’s **units-before-enable** step: **`kHostVelocityParamsBeforeEnable=1`** (default). If it still fails: verify **Access** = **Application Channel in Full Access**, quit ClearView if it holds the COM/hub, align MSP mode/limits with **MotionVelocity** (`docs/TECHDOC.md`), try **`kPreEnableDisable=1`** in **`teknic_cfg.h`**, or **`kHostVelocityParamsBeforeEnable=2`** only if your node accepts host AccLimit.
- **`teknic_init failed (-7)`**: **`Setup.AccessLevelIsFull()`** is false. Teknic’s API only **reads** this flag — there is **no** supported call to “take” full access (see **`pubSysCls.h`** / **`LoadingConfigFile.cpp`**). Close **ClearView** or use **Monitor Mode** when ClearView uses the motor diagnostic USB alongside the hub. If **ClearView is closed** and you connect **only** via diagnostic COM but still hit **-7**, power‑cycle the motor or set **`TeknicCfg::kRequireAccessLevelFull=0`** in **`teknic_cfg.h`** (skip the guard; rebuild **`teknic_motor.dll`** — you may still get parameter errors if access really is monitor‑only).
- **`teknic_init failed (-2)`**: **`FindComHubPorts`** only detects the **SC4‑HUB** USB adapter, not **USB plugged into the motor’s diagnostic port** — both show up as COM ports, but only the hub is auto‑listed. Note the COM number in Device Manager, set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** to that index, rebuild **`teknic_motor.dll`**. Confirm with **`SCNetworkReport.exe`** plus that COM index (same manual path as Teknic). **Exit ClearView** if it holds the port.
- **Motor service exits immediately**: Run **`npm run build:native -w @real-pendulum/motor-service`** so **`teknic_motor.dll`** exists; optional **`TEKNIC_DLL`** if the DLL is not under **`native/build/Release`**. Hub power, ClearView closed, COM not in use.
- **Port already in use**: Stop other dev servers or use `dev:no-kill` and free ports manually.
