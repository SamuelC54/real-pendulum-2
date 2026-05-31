import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@real-pendulum/physical-motor-service/sdk", () => ({
  motorConnectBaseUrl: vi.fn(() => "http://127.0.0.1:50051"),
  defaultMotorGrpcUrl: vi.fn(() => "http://127.0.0.1:50051"),
  normalizeMotorGrpcBaseUrl: vi.fn((s: string) => s),
  withMotorGrpcBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  connectMotor: vi.fn(),
  disconnectMotor: vi.fn(),
  setJogVelocityRpm: vi.fn(),
  stopMotor: vi.fn(),
  getMotorStatus: vi.fn(),
  moveToPosition: vi.fn(),
  zeroMeasuredPosition: vi.fn(),
}));

vi.mock("./homing.js", () => ({}));

vi.mock("@real-pendulum/simulation/client", () => ({
  physicsSimHealthCheck: vi.fn(async () => true),
  physicsSimGetState: vi.fn(async () => ({
    state: {
      xM: -9 / 232.8 / 100,
      vMps: 0,
      thetaRad: 0,
      omegaRps: 0,
      vCmdMps: -0.0007 * 3,
      encoderTicksFloat: 0,
      limitLeftPressed: false,
      limitRightPressed: false,
    },
    config: {
      gravity: 9.80665,
      pendulumLengthM: 0.3,
      cartVelocityTrackingPerSec: 10,
      angularDampingPerSec: 0,
      encoderTicksPerRadian: 1,
      maxInternalStepSec: 0.01,
    },
  })),
  physicsSimStep: vi.fn(async () => ({})),
  physicsSimMoveAbsolute: vi.fn(async () => ({})),
}));

vi.mock("@real-pendulum/physical-sensor-service/sdk", () => ({
  sensorConnectBaseUrl: vi.fn(() => "http://127.0.0.1:50052"),
  defaultSensorGrpcUrl: vi.fn(() => "http://127.0.0.1:50052"),
  normalizeSensorGrpcBaseUrl: vi.fn((s: string) => s),
  withSensorGrpcBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  connectSensor: vi.fn(),
  disconnectSensor: vi.fn(),
  listSerialPorts: vi.fn(),
  toggleLed: vi.fn(),
  resetEncoder: vi.fn(),
  getSensorStatus: vi.fn(),
}));

import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import * as physicsSim from "@real-pendulum/simulation/client";
import { resetTravelLimitsStateForTests } from "./railTravelLimits.js";
import { appRouter } from "./router.js";
describe("appRouter (motor mocked)", () => {
  beforeEach(() => {
    vi.mocked(motor.connectMotor).mockReset();
    vi.mocked(motor.disconnectMotor).mockReset();
    vi.mocked(motor.setJogVelocityRpm).mockReset();
    vi.mocked(motor.stopMotor).mockReset();
    vi.mocked(motor.getMotorStatus).mockReset();
    vi.mocked(physicsSim.physicsSimHealthCheck).mockReset().mockResolvedValue(true);
    vi.mocked(sensor.getSensorStatus).mockReset();
    vi.mocked(sensor.getSensorStatus).mockResolvedValue({
      connected: true,
      ledOn: false,
      detail: "ok",
      serialPort: "COM1",
      encoderTicks: 0,
      limitLeftPressed: false,
      limitRightPressed: false,
    });
    resetTravelLimitsStateForTests();
  });

  it("status.get returns friendly detail when motor is unreachable", async () => {
    vi.mocked(motor.getMotorStatus).mockRejectedValue(
      Object.assign(new Error("14 UNAVAILABLE: Connection refused"), { code: 14 }),
    );
    const caller = appRouter.createCaller({});
    const res = await caller.status.get();
    expect(res.connected).toBe(false);
    expect(res.commandedRpm).toBeCloseTo(0);
    expect(res.travelLimits).toEqual({ leftCm: null, rightCm: null });
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
    expect(res.connected).toBe(true);
    expect(res.commandedRpm).toBeCloseTo(12.5);
    expect(res.detail).toBe("ok");
    expect(res.positionCm).toBeCloseTo(-7 / 232.8, 6);
    expect(res.travelLimits).toEqual({ leftCm: null, rightCm: null });
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
    expect(motor.setJogVelocityRpm).toHaveBeenCalledWith(expect.closeTo(100));
  });

  it("jog.setVelocity clamps rpm when left limit is pressed", async () => {
    vi.mocked(motor.setJogVelocityRpm).mockResolvedValue({ ok: true, error: "" });
    vi.mocked(sensor.getSensorStatus).mockResolvedValue({
      connected: true,
      ledOn: false,
      detail: "ok",
      serialPort: "COM1",
      encoderTicks: 0,
      limitLeftPressed: true,
      limitRightPressed: false,
    });
    const caller = appRouter.createCaller({});
    const res = await caller.jog.setVelocity({ rpm: 100 });
    expect(res.ok).toBe(false);
    expect(motor.setJogVelocityRpm).not.toHaveBeenCalled();
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
    expect(st.travelLimits?.leftCm).toBeCloseTo(-42 / 232.8, 6);
  });

  it("rail.zeroAtCurrent calls Teknic zero when motor is connected", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 0,
      detail: "ok",
      measuredPosition: 12,
    });
    vi.mocked(motor.zeroMeasuredPosition).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({});
    await expect(caller.rail.zeroAtCurrent()).resolves.toEqual({ ok: true });
    expect(motor.zeroMeasuredPosition).toHaveBeenCalledTimes(1);
  });

  it("rail.limits.setSymmetricSpan sets left/right from current position ± half span", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 0,
      detail: "ok",
      measuredPosition: 0,
    });
    const caller = appRouter.createCaller({});
    const r = await caller.rail.limits.setSymmetricSpan({ halfSpanCm: 20 });
    expect(r.ok).toBe(true);
    expect(r.centerCm).toBeCloseTo(0, 9);
    expect(r.leftCm).toBeCloseTo(-20, 9);
    expect(r.rightCm).toBeCloseTo(20, 9);
    const st = await caller.status.get();
    expect(st.travelLimits?.leftCm).toBeCloseTo(-20, 6);
    expect(st.travelLimits?.rightCm).toBeCloseTo(20, 6);
  });

  it("rail.zeroAtCurrent fails when motor is not connected", async () => {
    vi.mocked(motor.zeroMeasuredPosition).mockClear();
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: false,
      commandedRpm: 0,
      detail: "",
    });
    const caller = appRouter.createCaller({});
    await expect(caller.rail.zeroAtCurrent()).rejects.toThrow(/Motor is not connected/);
    expect(motor.zeroMeasuredPosition).not.toHaveBeenCalled();
  });

  it("twin.connection.connect returns real ok when simulation is down", async () => {
    vi.mocked(motor.connectMotor).mockResolvedValue({ ok: true, error: "" });
    vi.mocked(physicsSim.physicsSimHealthCheck).mockResolvedValueOnce(false);
    const caller = appRouter.createCaller({});
    const r = await caller.twin.connection.connect();
    expect(r.real).toEqual({ ok: true, error: "" });
    expect(r.sim.ok).toBe(false);
    expect(r.sim.error).toContain("simulation");
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
    expect(r.real.travelLimits).toEqual({ leftCm: null, rightCm: null });
    expect(r.sim.travelLimits).toEqual({ leftCm: null, rightCm: null });
    expect(r.real.positionCm).toBeCloseTo(-9 / 232.8, 6);
  });
});
