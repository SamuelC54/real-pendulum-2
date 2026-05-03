# Testing strategy — real-pendulum-2

This document proposes how to test the stack **without** relying on a single “run everything on hardware” loop. The project combines **browser → tRPC → gRPC → native DLL → Teknic hardware**, so tests should be layered: fast automated checks where possible, explicit hardware sessions where unavoidable.

---

## 1. Goals

| Goal | Why it matters |
|------|----------------|
| **Catch regressions before touching the rail** | Logic bugs in parsing, RPC wiring, and UI state should not require powered hardware. |
| **Isolate hardware** | Motor and hub behavior are non-deterministic across machines; CI should not depend on USB/COM. |
| **Keep motion tests safe** | Any test that commands torque must assume pinch/crush risk and use bounded velocities and operator presence. |

---

## 2. Test pyramid (adapted for physical hardware)

```
                    ┌─────────────────┐
                    │ Manual / smoke  │  bench, cleared travel, operator
                    │ on real hardware│
                ┌───┴─────────────────┴───┐
                │ E2E (optional)          │  Playwright against dev stack + stub or lab
            ┌───┴─────────────────────────┴───┐
            │ Integration                    │  control-api ↔ fake motor-grpc
        ┌───┴─────────────────────────────────┴───┐
        │ Contract / proto                         │  generated stubs, golden JSON
    ┌───┴─────────────────────────────────────────┴───┐
    │ Unit                                              │  pure TS: Zod, mappers, helpers
    └───────────────────────────────────────────────────┘
```

**Bottom layers** run in CI on every push. **Top layers** run on demand in a controlled lab.

---

## 3. What to test where

### 3.1 Unit tests (Node / TypeScript)

**Best targets**

- **Zod schemas** and validation at API boundaries (input clamping, enums).
- **Pure functions**: velocity scaling, status mapping from gRPC payloads to UI models, error-message helpers.
- **tRPC router procedures** when dependencies are **injected** (pass a fake `MotorClient` instead of live gRPC).

**Tooling**: [Vitest](https://vitest.dev/) fits Vite/React workspaces and runs fast under `tsx`; alternatively Node’s built-in test runner.

**Avoid** in unit tests: importing `koffi`, loading `teknic_motor.dll`, or opening real gRPC ports unless behind an interface you swap in tests.

### 3.2 Contract and serialization

- **Proto / JSON shapes**: If you add fields to `motor.proto` or motor-info JSON from the native layer, add **snapshot or fixture tests** so server and UI stay aligned.
- **Breaking API checks**: When changing tRPC procedures, treat **web + control-api** as one contract; a small test that imports shared types or runs `tsc` across workspaces already catches many mismatches.

### 3.3 Integration tests — control-api without hardware

**Pattern**: Start an **in-process fake** gRPC server that implements the same `.proto` as `motor-grpc`, returning canned `GetStatus` / acknowledging `Connect` / `Jog` without touching the DLL.

- Validates **wiring**: tRPC → gRPC client → timeouts, error mapping, reconnect behavior.
- Runs in CI.

**Pattern**: **Recorded responses** (golden files): capture one successful `GetStatus` blob from a lab machine (no secrets), commit as fixture, assert parsers still accept it.

### 3.4 motor-grpc (Node + native DLL)

Split concerns:

| Piece | Test approach |
|-------|----------------|
| **gRPC server** (TypeScript) | Integration test against **fake DLL** or **mock koffi symbols** if you introduce a thin loader interface — otherwise manual/smoke only. |
| **Native `teknic_motor`** | **No Teknic hardware in CI**: rely on **desktop builds** (`cmake --build`) as a compile/regression gate; optional **mock SysManager** layer is a large investment — usually deferred. |
| **Smoke after build** | Script that loads the DLL and exports symbols exist (`teknic_init` present) without calling USB — possible on Windows agents if DLL is built as an artifact. |

### 3.5 Web (React)

- **Component tests** (Vitest + React Testing Library): jog buttons disabled when disconnected, fault banners, numeric inputs.
- **E2E** (Playwright): optional; high value for “operator flows,” cost of flakiness unless motor-grpc is **stubbed** or you run against a **fixed lab URL**.

---

## 4. Hardware and smoke testing (mandatory for motion changes)

Use a short **checklist** each time native code or motion parameters change:

1. **Environment**: ClearView closed; only one owner of the hub; bench clear; emergency stop accessible if fitted.
2. **Connect**: UI or `grpcurl` — verify `Connect` / status reflects hub found.
3. **Zero-motion**: `GetStatus` / motor info JSON sane (node online, no unexpected faults).
4. **Bounded jog**: small velocity, short duration, hand ready to stop; verify stop command and idle state.
5. **Fault injection** (when safe): disconnect USB during idle — service should surface error without crashing the whole Node process (document actual behavior).

Treat this as **release QA**, not something to automate blindly without safeguards.

---

## 5. CI recommendations

| Job | Purpose |
|-----|---------|
| **`npm run build`** (all workspaces) | TypeScript + web bundle compile. |
| **Native build** (Windows runner or self-hosted) | Ensure `teknic_motor` still links after SDK/C++ edits; artifact optional. |
| **Unit + integration tests** | Once added — must not open COM ports. |
| **Lint/format** (optional) | Consistency if you add ESLint/Prettier. |

Skip **full hardware E2E** in generic cloud CI.

---

## 6. Prioritized rollout

1. **Vitest** + first tests on **pure helpers and Zod** in `control-api` (lowest risk, immediate value).
2. **Fake gRPC motor** + integration tests for **tRPC procedures** that talk to the motor client.
3. **Web component tests** for jog UI state machine.
4. **Playwright** only after stubs exist or for static pages.
5. **Documented hardware smoke script** (manual checklist / optional semi-automated grpcurl steps).

---

## 7. Related documents

- [TECHDOC.md](./TECHDOC.md) — architecture and Phase 1 scope.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-02 | Initial testing strategy. |
