# Testing strategy — real-pendulum-2

This document describes how the repo is tested **without** relying on a single “run everything on hardware” loop. The stack is **browser → tRPC → gRPC → native DLL → Teknic hardware**, so checks are layered: fast automated tests in CI, explicit hardware passes when motion changes.

---

## 1. Goals

| Goal | Why it matters |
|------|----------------|
| **Catch regressions before touching the rail** | Logic bugs in parsing, RPC wiring, and UI state should not require powered hardware. |
| **Isolate hardware** | Motor and hub behavior is machine-specific; CI must not open USB/COM. |
| **Keep motion tests safe** | Any test that commands torque assumes pinch/crush risk — use bounded velocities and operator presence for manual passes. |

---

## 2. Test pyramid (adapted for physical hardware)

```
                    ┌─────────────────┐
                    │ Manual / smoke  │  bench, cleared travel, operator
                    │ on real hardware│
                ┌───┴─────────────────┴───┐
                │ E2E                       │  Playwright — fake gRPC + control-api + Vite dev
            ┌───┴─────────────────────────┴───┐
            │ Integration                    │  control-api ↔ fake `MotorService` (in-process gRPC)
        ┌───┴─────────────────────────────────┴───┐
        │ Contract / proto                         │  Golden JSON + `mapMotorInfo` snapshot
    ┌───┴─────────────────────────────────────────┴───┐
    │ Unit                                              │  Vitest: helpers, router mocks, `JogControls`
    └───────────────────────────────────────────────────┘
```

**Bottom layers** run on every `npm test`. **E2E** runs in CI via **`npm run test:e2e`** (after **`npm run build`**). **Manual** bench pass: [`hardware-smoke-checklist.md`](./hardware-smoke-checklist.md).

---

## 3. What is implemented where

### 3.1 Unit tests (Node / TypeScript) — `apps/control-api`

| Area | Location |
|------|-----------|
| gRPC unreachable messaging | `src/motorErrors.ts`, `src/motorErrors.test.ts` |
| `mapMotorInfo` | `src/motorClient.ts`, `src/motorClient.test.ts` |
| tRPC procedures (gRPC mocked) | `src/router.ts`, `src/router.test.ts` |

Run: `npm run test -w @real-pendulum/control-api` or `npm test` from repo root.

### 3.2 Contract and serialization

| Area | Location |
|------|-----------|
| Fixture for `GetStatus`-style wire JSON | `apps/control-api/src/fixtures/motor-status-wire.sample.json` |
| Snapshot of mapped `MotorInfo` | `apps/control-api/src/motorContract.test.ts` |

When **`motor.proto`** or **`mapMotorInfo`** changes, update the fixture and/or snapshot deliberately.

### 3.3 Integration tests — control-api without hardware

| Area | Location |
|------|-----------|
| In-process fake **MotorService** (same `.proto` as `motor-grpc`) | `apps/control-api/src/test-support/fakeMotorGrpcServer.ts` |
| Real `motorClient` calls against fake server | `apps/control-api/src/motorClient.integration.test.ts` |

Uses ephemeral TCP (`127.0.0.1:0`), sets **`MOTOR_GRPC_URL`**, and **`resetMotorGrpcClientForTests()`** so the gRPC client cache does not leak between runs.

### 3.4 motor-grpc (Node + native DLL)

| Piece | Status |
|-------|--------|
| **DLL load smoke** (Windows; no `teknic_init`) | `npm run check:dll -w @real-pendulum/motor-grpc` → `scripts/check-teknic-dll.ts`. Exits **0** if no DLL or non-Windows (skip). |
| **Native C++ build in CI** | Job **`native-windows`** on **`windows-latest`** when **`TEKNIC_SDK_ROOT`** (repository variable) or the default **`C:\Program Files (x86)\Teknic\ClearView\sdk`** contains **`inc`** and **`sFoundation Source\...\Release\x64\sFoundation20.lib`**. Otherwise the job prints a notice and skips the compile (green CI). Requires **Visual Studio 2022** / MSVC (runner provides this) and **sFoundation built Release x64**. |

### 3.5 Web (React)

| Area | Location |
|------|-----------|
| Pure jog sign/magnitude | `apps/web/src/lib/jogMath.ts`, `jogMath.test.ts` |
| Jog buttons enabled/disabled vs `connected` / `busy` | `apps/web/src/components/JogControls.tsx`, `JogControls.test.tsx` |

`App.tsx` composes **`JogControls`** and **`jogMath`** so UI logic can be tested without tRPC providers.

### 3.6 Playwright E2E

| Mode | Command | Orchestrator | Ports (defaults) |
|------|---------|--------------|------------------|
| **Fake motor** (default, CI) | **`npm run test:e2e`** | **`scripts/e2e-stack.mjs`** — in-process fake **`MotorService`** → **`start:tsx`** control-api → **Vite dev** | **50552** / **14001** / **4174** — avoids clashing with **`npm run dev`** |
| **Real motor** (local + hardware) | **`npm run test:e2e:real`** | **`scripts/e2e-stack-real.mjs`** — **`motor-grpc`** (**`start:tsx`**, loads **`teknic_motor.dll`**) → control-api → Vite | **50051** / **4000** / **5173** (or **`.env`**: **`MOTOR_GRPC_PORT`**, **`CONTROL_API_PORT`**, **`VITE_DEV_PORT`** / **`E2E_WEB_PORT`**) |

Set **`E2E_USE_REAL_MOTOR=1`** (or use **`cross-env`** via **`npm run test:e2e:real`**) so **`playwright.config.cjs`** selects **`e2e-stack-real.mjs`**. Loads repo **`.env`** / **`.env.local`** so **`TEKNIC_DLL`** etc. apply. Real runs need **`npm run build:native`** first, hub power, and **ClearView** closed — same as **[hardware-smoke-checklist.md](./hardware-smoke-checklist.md)**.

Run **`npm run build`** before E2E so workspace TypeScript builds; **Vite dev** picks up **`VITE_CONTROL_API_URL`** at stack start.

**Real-hardware Motor API coverage** (skipped unless **`E2E_USE_REAL_MOTOR=1`**): **`e2e/motor-api-real.spec.ts`** — serial tests for **GetStatus** (UI), **SetJogVelocity** + **Stop** (brief jog, then assert rpm near zero), and **Disconnect**. Supervise the bench; same risks as manual jog.

---

## 4. Hardware and smoke testing

See **[hardware-smoke-checklist.md](./hardware-smoke-checklist.md)** for the manual sequence (connect, status, bounded jog, fault).

---

## 5. CI (GitHub Actions)

Workflow **`.github/workflows/ci.yml`** defines:

| Job | Runner | Steps |
|-----|--------|--------|
| **`build-test-e2e`** | `ubuntu-latest` | `npm ci` → **`npm test`** → **`npm run build`** → **`playwright install --with-deps chromium`** → **`npm run test:e2e`** (`CI=true`). |
| **`native-windows`** | `windows-latest` | `npm ci` → **`ilammy/msvc-dev-cmd`** → detect SDK → **`npm run build:native`** if SDK present → upload **`teknic_motor.dll`** artifact on success. |

Set repository variable **`TEKNIC_SDK_ROOT`** if the SDK is not under the default ClearView path. You must build Teknic **sFoundation** (Release **x64**) once so **`sFoundation20.lib`** exists before CMake links **`teknic_motor`**.

---

## 6. Commands reference

| Command | Purpose |
|---------|---------|
| `npm test` | All workspace Vitest suites (`control-api` + `web`). |
| `npm run test:e2e` | Playwright (`e2e/`); fake motor stack via **`scripts/e2e-stack.mjs`**. **`npm run build`** first. |
| `npm run test:e2e:real` | Playwright with **real** **`motor-grpc`** via **`scripts/e2e-stack-real.mjs`** (**`E2E_USE_REAL_MOTOR=1`**). Requires native DLL + hardware. |
| `npm run test:e2e:ui` | Playwright UI mode (local debugging). |
| `npm run test -w @real-pendulum/control-api` | API/router/integration only. |
| `npm run test -w web` | Web unit/component tests only. |
| `npm run check:dll -w @real-pendulum/motor-grpc` | Windows: load DLL with koffi if present (optional local smoke). |

---

## 7. Related documents

- [TECHDOC.md](./TECHDOC.md) — architecture and Phase 1 scope.
- [hardware-smoke-checklist.md](./hardware-smoke-checklist.md) — manual bench verification.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-02 | Initial testing strategy. |
| 2026-05-02 | Documented Vitest, fake gRPC, fixtures, web components, CI, DLL smoke, hardware checklist. |
| 2026-05-03 | Playwright E2E (`e2e-stack`, dedicated ports), CI `native-windows` + Teknic SDK detection. |
| 2026-05-03 | Real-motor E2E (`e2e-stack-real`, `E2E_USE_REAL_MOTOR`); `playwright.config.cjs` (CJS + dotenv). |
