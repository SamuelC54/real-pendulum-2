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

  it("meta.backends exposes default coupled sim URL", async () => {
    const prevPort = process.env.SIM_COUPLED_GRPC_PORT;
    delete process.env.SIM_COUPLED_GRPC_PORT;
    const caller = appRouter.createCaller({});
    try {
      const r = await caller.meta.backends();
      expect(r.simDefaultUrl).toBe("http://127.0.0.1:58870");
    } finally {
      if (prevPort === undefined) delete process.env.SIM_COUPLED_GRPC_PORT;
      else process.env.SIM_COUPLED_GRPC_PORT = prevPort;
    }
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
