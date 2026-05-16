import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@real-pendulum/motor-service/sdk", () => ({
  motorConnectBaseUrl: vi.fn(() => "http://127.0.0.1:50051"),
  defaultMotorGrpcUrlFromEnv: vi.fn(() => "http://127.0.0.1:50051"),
  normalizeMotorGrpcBaseUrl: vi.fn((s: string) => s),
  withMotorGrpcBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  connectMotor: vi.fn(),
  disconnectMotor: vi.fn(),
  setJogVelocityRpm: vi.fn(),
  stopMotor: vi.fn(),
  getMotorStatus: vi.fn(),
  moveToPosition: vi.fn(),
}));

vi.mock("./homing.js", () => ({
  runRailHoming: vi.fn(),
}));

vi.mock("@real-pendulum/sensor-service/sdk", () => ({
  sensorConnectBaseUrl: vi.fn(() => "http://127.0.0.1:50052"),
  defaultSensorGrpcUrlFromEnv: vi.fn(() => "http://127.0.0.1:50052"),
  normalizeSensorGrpcBaseUrl: vi.fn((s: string) => s),
  withSensorGrpcBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  connectSensor: vi.fn(),
  disconnectSensor: vi.fn(),
  listSerialPorts: vi.fn(),
  toggleLed: vi.fn(),
  resetEncoder: vi.fn(),
  getSensorStatus: vi.fn(),
}));

import * as motor from "@real-pendulum/motor-service/sdk";
import { runRailHoming } from "./homing.js";
import { resetTravelLimitsStateForTests } from "./railTravelLimits.js";
import { appRouter } from "./router.js";

describe("appRouter (motor mocked)", () => {
  beforeEach(() => {
    vi.mocked(motor.connectMotor).mockReset();
    vi.mocked(motor.disconnectMotor).mockReset();
    vi.mocked(motor.setJogVelocityRpm).mockReset();
    vi.mocked(motor.stopMotor).mockReset();
    vi.mocked(motor.getMotorStatus).mockReset();
    resetTravelLimitsStateForTests();
  });

  it("status.get returns friendly detail when motor is unreachable", async () => {
    vi.mocked(motor.getMotorStatus).mockRejectedValue(
      Object.assign(new Error("14 UNAVAILABLE: Connection refused"), { code: 14 }),
    );
    const caller = appRouter.createCaller({});
    const res = await caller.status.get();
    expect(res.connected).toBe(false);
    expect(res.commandedRpm).toBe(0);
    expect(res.travelLimits).toEqual({ left: null, right: null });
    expect(res.detail).toContain("Motor service not reachable at http://127.0.0.1:50051");
  });

  it("status.get returns live status when client succeeds", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 12.5,
      detail: "ok",
      measuredPosition: 7,
    });
    const caller = appRouter.createCaller({});
    const res = await caller.status.get();
    expect(res).toEqual({
      connected: true,
      commandedRpm: 12.5,
      detail: "ok",
      measuredPosition: 7,
      travelLimits: { left: null, right: null },
    });
  });

  it("connection.connect wraps motor errors", async () => {
    vi.mocked(motor.connectMotor).mockRejectedValue(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller({});
    await expect(caller.connection.connect()).rejects.toThrow(/Motor service not reachable/);
  });

  it("connection.connect returns motor result on success", async () => {
    vi.mocked(motor.connectMotor).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({});
    await expect(caller.connection.connect()).resolves.toEqual({ ok: true, error: "" });
  });

  it("jog.setVelocity forwards rpm", async () => {
    vi.mocked(motor.setJogVelocityRpm).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({});
    await caller.jog.setVelocity({ rpm: 100 });
    expect(motor.setJogVelocityRpm).toHaveBeenCalledWith(100);
  });

  it("rail.limits.record stores display count from motor measured position", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 0,
      detail: "ok",
      measuredPosition: 42,
    });
    const caller = appRouter.createCaller({});
    await caller.rail.limits.record({ side: "left" });
    const st = await caller.status.get();
    expect(st.travelLimits?.left).toBe(-42);
  });

  it("twin.connection.connect returns real ok when sim gRPC throws", async () => {
    vi.mocked(motor.connectMotor)
      .mockResolvedValueOnce({ ok: true, error: "" })
      .mockRejectedValueOnce(Object.assign(new Error("14 UNAVAILABLE: sim down"), { code: 14 }));
    const caller = appRouter.createCaller({});
    const r = await caller.twin.connection.connect();
    expect(r.real).toEqual({ ok: true, error: "" });
    expect(r.sim.ok).toBe(false);
    expect(r.sim.error).toContain("Motor service not reachable");
  });

  it("twin.status.get returns real and sim motor snapshots", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 3,
      detail: "ok",
      measuredPosition: 9,
    });
    const caller = appRouter.createCaller({});
    const r = await caller.twin.status.get();
    expect(r.real.connected).toBe(true);
    expect(r.real.commandedRpm).toBe(3);
    expect(r.sim.connected).toBe(true);
    expect(r.sim.commandedRpm).toBe(3);
    expect(r.real.travelLimits).toEqual({ left: null, right: null });
    expect(r.sim.travelLimits).toEqual({ left: null, right: null });
  });
});

describe("appRouter rail.home", () => {
  beforeEach(() => {
    vi.mocked(runRailHoming).mockReset();
  });

  it("returns homing result", async () => {
    vi.mocked(runRailHoming).mockResolvedValue({
      ok: true,
      motorSpanCounts: 100,
      motorAbsRevolutions: 2,
      log: ["done"],
    });
    const caller = appRouter.createCaller({});
    const res = await caller.rail.home();
    expect(res.ok).toBe(true);
    expect(res.motorSpanCounts).toBe(100);
  });
});
