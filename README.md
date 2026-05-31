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

Runs **Vitest** for **`@real-pendulum/control-api`** (unit tests, **simulation `MotorService`** integration tests, contract fixtures) and **`web`** (`jogMath`, **`JogControls`**). No Teknic hardware required.

**End-to-end (Playwright)** — **`npm run build`** then:

| Command | Stack |
|---------|--------|
| **`npm run test:e2e`** | Simulation (**simulation** + **MotorService** / **SensorService**) + **control-api** + **Vite** on isolated ports (**50552** / **14001** / **4174**, see **`playwright.config.cjs`**) — default CI/local smoke, no hardware. |
| **`npm run test:e2e:real`** | Real **motor service** (Teknic DLL) + **control-api** + **Vite** on dev ports from **`config`** (defaults **50051** / **4000** / **5173**). Uses **`playwright.real.config.cjs`**. Build native first: **`npm run build:native -w @real-pendulum/physical-motor-service`**, ClearView closed. Extra spec **`e2e/motor-api-real.spec.ts`** (skipped in sim E2E). |

UI mode: **`npm run test:e2e:ui`**, **`npm run test:e2e:real:ui`** — or **`npx playwright test --ui`**.

**CI** (GitHub Actions): Ubuntu — **`npm test`**, **`npm run build`**, **`npm run test:e2e:ci`** (Chromium); Windows — optional **`teknic_motor.dll`** build — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`docs/testing-strategy.md`](docs/testing-strategy.md).

**Manual bench pass** after native/motion changes: [`docs/hardware-smoke-checklist.md`](docs/hardware-smoke-checklist.md).

**Windows optional DLL smoke** (after building `teknic_motor.dll`):  
`npm run check:dll -w @real-pendulum/physical-motor-service`

### Configuration

Edit **`packages/app-config/src/config.ts`** for ports, homing, simulation parameters, Teknic native build paths, flash options, and E2E sim-stack ports (`config.e2e`). Services accept optional CLI overrides (`--port`, `--motor-grpc-url`) when spawned by scripts.

**Teknic motion limits** are in **`TeknicCfg`** (`apps/physical-motor-service/native/teknic_motor/teknic_cfg.h`) — rebuild the DLL after changes. **`FindComHubPorts`** only sees the **SC4-HUB** USB adapter; for motor diagnostic USB set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** ≥ 1.

---

## Motor service (Connect RPC) — `apps/physical-motor-service`

Workspace npm package: **`@real-pendulum/physical-motor-service`** (folder **`apps/physical-motor-service`**). Shared protobuf types live in **`packages/motor-proto`** (**`npm run proto:generate`** after **`proto/motor.proto`** changes).

Layout:

| Path | Purpose |
|------|---------|
| **`native/teknic_motor/`** | CMake → **`teknic_motor.dll`** (Teknic ClearPath / SC4-HUB). |
| **`src/server.ts`** | Node **`motor.v1.MotorService`** via [**Connect**](https://connectrpc.com/) (HTTP on **`config.motor.grpcPort`**). |
| **`src/teknic/`** | **koffi** bindings (**`dll.ts`**) for **`teknic_motor.dll`**. |
| **`scripts/`** | **`build-native.mjs`** configures and builds **`teknic_motor.dll`**. |

**`npm run dev`** starts the stack in Docker. For native hot-reload: **`npm run dev:local`** (builds **`teknic_motor.dll`** via **`npm run build:native`** first).

**Control API** talks to the motor over Connect (default **`motorGrpcBaseUrl()`** from config).

The **sensor service** (**`@real-pendulum/physical-sensor-service`**, default port **50052** in config) talks to Arduino over USB serial. The web UI lists serial ports before **Connect**; optional fallback **`config.sensor.serialPort`**. Flash: **`npm run flash:sensor-firmware -- COM3`** (Arduino CLI; options in **`config.flash`**). UI flash waits **`config.controlApi.flashAfterDisconnectMs`** before upload.

**Build the DLL** (from **`apps/physical-motor-service`** or repo root **`-w @real-pendulum/physical-motor-service`**):

```bash
npm run build:native
```

Output: **`native/build/Release/teknic_motor.dll`**.

**Native configuration (hub motion in C++, not config.ts):** Edit the **`TeknicCfg`** namespace at the top of  
`apps/physical-motor-service/native/teknic_motor/teknic_cfg.h` (and related `.cpp` modules under that folder) — **`kEnableReqOnConnect`** (1 = enable axis for jog, 0 = read-only node info, no motion), **`WaitForOnline`** timeout, accel limit (**`kAccLimitRpmPerSec`**), jog clamp (**`kJogVelLimitRpm`**), enable retries, optional **`kManualComWhenDiscoveryEmpty`** (Windows: if ≥1, **`ComHubPort(0, n)`** and **skip** **`FindComHubPorts`**). If discovery is empty and manual is 0, **`kComPortScanMin`** / **`kComPortScanMax`** (default **1..25**) **probe each COM** until a port reports a ClearPath node (same as **`SCNetworkReport`** manual COM per index). Set **`kComPortScanMin = 0`** and **`kComPortScanMax = 0`** to disable COM scanning. Jog uses **`Ports(0)`** only. Rebuild **`teknic_motor.dll`** after any change.

**ClearView and this app cannot share the hub.** Quit ClearView completely before starting the **motor service**. Only one process may open the SC4-HUB serial port.

**Sanity check (no motion):** **`SCNetworkReport.exe <COM index>`** (e.g. **`5`** for COM5) only reads node info; it does not command moves. Use it for **motor diagnostic COM** or RS‑232 when **`FindComHubPorts`** (no args) finds nothing — hub discovery only enumerates the SC4‑HUB USB device.

---

## Start the stack (development)

From the **repository root** (requires [Docker](https://docs.docker.com/get-docker/)):

```bash
npm run dev
```

This runs **`docker compose up --build`** — simulation, controller-service, control-api, web, **Portainer CE**, and **Jaeger** (`jaegertracing/jaeger:2.17.0`).

| Service | Role | URL / port |
|---------|------|------------|
| **web** | React UI (nginx) | `http://localhost:5173` |
| **api** | tRPC HTTP API | `http://localhost:4000` (`/trpc/`) |
| **simulation** | MuJoCo plant (internal) | — |
| **controller-service** | Rail controllers (internal) | — |
| **portainer** | Container UI (always) | `https://localhost:9443` · login **`admin`** / **`pass`** (reset below) |
| **jaeger** | Distributed traces (OpenTelemetry) | `http://localhost:16686` |

Open **`http://localhost:5173`**. Use **Simulator** backend mode in the UI (no Teknic DLL required). The **Containers** tab embeds Portainer. Each API response includes an **`x-trace-id`** header — the UI shows it in the bottom-right corner with a link to **Jaeger**, where one trace spans control-api, simulation, and controller-service spans.

If you previously installed Portainer manually (`docker run … portainer`), stop that container first — this stack runs its own Portainer on **9443** / **9000**:

```bash
docker stop portainer && docker rm portainer
```

Portainer CE username is always **`admin`**. To set or reset the password:

```bash
npm run dev:portainer-reset-password
```

This **stops Portainer**, waits for the BoltDB lock to clear, runs `portainer/helper-reset-password`, then starts Portainer again. Default password: **`pass`**.

If Portainer logs **`Unable to open the database, err: timeout`**, another container still has `portainer_data` open — stop everything using that volume, wait a few seconds, then retry:

```bash
docker compose stop portainer
docker ps -a --filter volume=real-pendulum_portainer_data
npm run dev:portainer-reset-password
```

**Hardware** (Teknic motor + Arduino sensor in Docker):

```bash
npm run build:native -w @real-pendulum/physical-motor-service   # Windows — teknic_motor.dll
npm run dev:hardware
```

**Native processes** (no Docker — hot reload, local Python/Node):

```bash
npm run dev:local
```

Other scripts: **`npm run dev:detach`** (background), **`npm run dev:down`**, **`npm run dev:logs`**.

Other useful ports:

| Variable | Service |
|----------|---------|
| `MOTOR_GRPC_PORT` | Motor Connect listen port (default `50051`; `dev:hardware` / `dev:local`). |
| `SENSOR_GRPC_PORT` | Sensor Connect listen port (default `50052`). |
| `CONTROL_API_PORT` | tRPC server (default `4000`). |
| `PORTAINER_IFRAME_URL` | Portainer iframe path (default `/portainer/` via web proxy). |
| `PORTAINER_HTTPS_URL` | Portainer HTTPS URL for new tab (default `https://127.0.0.1:9443`). |
| `JAEGER_DEPENDENCIES_URL` | Jaeger dependency map iframe (default `/jaeger/dependencies`). |
| `PORTAINER_ADMIN_PASSWORD` | Password for **`portainer-reset-password`** helper (default `pass`). |
| `JAEGER_UI_URL` | Jaeger UI for trace links (default `http://127.0.0.1:16686`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP collector (default `http://jaeger:4318` in Docker). |

---

## Production-style build

Compile TypeScript apps and the web bundle:

```bash
npm run build
```

Run compiled services individually if needed (motor: `npm run start -w @real-pendulum/physical-motor-service`, etc.).

---

## Troubleshooting

- **`cmake.exe not found` after installing CMake**: Close and reopen the terminal (PATH is only refreshed in new sessions). If you installed “for current user only”, CMake is often under `%LOCALAPPDATA%\Programs\CMake\bin\cmake.exe` — the build script checks there; you can also set `CMAKE_BIN` to that full path. In PowerShell, do not use `where /R` (that is a **cmd** command); use `where.exe cmake` or search with `Get-ChildItem ... -Filter cmake.exe -Recurse`.
- **`0x80040105` / `Parameter(62)` / “failed to write 13333…” before `EnableReq`**: Host **`Motion.AccLimit`** ( **`kHostVelocityParamsBeforeEnable=2`** + **`kAccLimitRpmPerSec`** ) was rejected — MSP often owns limits. Use **`kHostVelocityParamsBeforeEnable=1`** ( **`VelUnit` / `AccUnit` only** , no host AccLimit) or **`0`**, tune **MSP/ClearView**, rebuild **`teknic_motor.dll`**.
- **`Parameter(50)` on `EnableReq`**: Often fixed by Teknic’s **units-before-enable** step: **`kHostVelocityParamsBeforeEnable=1`** (default). If it still fails: verify **Access** = **Application Channel in Full Access**, quit ClearView if it holds the COM/hub, align MSP mode/limits with **MotionVelocity** (`docs/TECHDOC.md`), try **`kPreEnableDisable=1`** in **`teknic_cfg.h`**, or **`kHostVelocityParamsBeforeEnable=2`** only if your node accepts host AccLimit.
- **`teknic_init failed (-7)`**: **`Setup.AccessLevelIsFull()`** is false. Teknic’s API only **reads** this flag — there is **no** supported call to “take” full access (see **`pubSysCls.h`** / **`LoadingConfigFile.cpp`**). Close **ClearView** or use **Monitor Mode** when ClearView uses the motor diagnostic USB alongside the hub. If **ClearView is closed** and you connect **only** via diagnostic COM but still hit **-7**, power‑cycle the motor or set **`TeknicCfg::kRequireAccessLevelFull=0`** in **`teknic_cfg.h`** (skip the guard; rebuild **`teknic_motor.dll`** — you may still get parameter errors if access really is monitor‑only).
- **`teknic_init failed (-2)`**: **`FindComHubPorts`** only detects the **SC4‑HUB** USB adapter, not **USB plugged into the motor’s diagnostic port** — both show up as COM ports, but only the hub is auto‑listed. Note the COM number in Device Manager, set **`TeknicCfg::kManualComWhenDiscoveryEmpty`** to that index, rebuild **`teknic_motor.dll`**. Confirm with **`SCNetworkReport.exe`** plus that COM index (same manual path as Teknic). **Exit ClearView** if it holds the port.
- **Motor service exits immediately**: Run **`npm run build:native -w @real-pendulum/physical-motor-service`** so **`teknic_motor.dll`** exists; optional **`TEKNIC_DLL`** if the DLL is not under **`native/build/Release`**. Hub power, ClearView closed, COM not in use.
- **Port already in use**: Run **`npm run dev:down`**, or stop containers in Portainer. If **`Bind for 0.0.0.0:9443` or `:9000` failed**, another Portainer instance is still running — **`docker stop portainer && docker rm portainer`**, then **`npm run dev`** again.
- **Portainer `Unable to open the database, err: timeout`**: Portainer and the password-reset helper cannot share `portainer_data` at the same time. Run **`docker compose stop portainer`**, wait a few seconds, then **`npm run dev:portainer-reset-password`** or **`docker compose start portainer`**.
