import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@real-pendulum/physical-motor-service/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/physical-motor-service/sdk")>();
  return {
    ...actual,
    motorConnectBaseUrl: vi.fn(() => "http://127.0.0.1:50051"),
    defaultMotorGrpcUrl: vi.fn(() => "http://127.0.0.1:50051"),
    normalizeMotorGrpcBaseUrl: vi.fn((s: string) => s),
    withMotorGrpcBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
    connectMotor: vi.fn(),
    disconnectMotor: vi.fn(),
    setJogVelocityCmPerSec: vi.fn(),
    stopMotor: vi.fn(),
    getMotorStatus: vi.fn(),
    moveToPosition: vi.fn(),
    zeroMeasuredPosition: vi.fn(),
  };
});

vi.mock("@real-pendulum/simulation/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/simulation/client")>();
  return {
    ...actual,
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
  };
});

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
import * as physicsSim from "@real-pendulum/simulation/client";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import { resetTravelLimitsStateForTests } from "./control/backends/instances.js";
import { appRouter } from "./router.js";

describe("appRouter (motor mocked)", () => {
  beforeEach(() => {
    vi.mocked(motor.connectMotor).mockReset();
    vi.mocked(motor.disconnectMotor).mockReset();
    vi.mocked(motor.setJogVelocityCmPerSec).mockReset();
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

  it("machine.state.get returns friendly detail when motor is unreachable", async () => {
    vi.mocked(motor.getMotorStatus).mockRejectedValue(
      Object.assign(new Error("14 UNAVAILABLE: Connection refused"), { code: 14 }),
    );
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    const res = await caller.machine.state.get();
    const state = res.physical!;
    expect(state.connection.cart).toBe(false);
    expect(state.cart.commandedCmPerSec).toBeCloseTo(0);
    expect(state.cart.travelLimitsCm).toEqual({ left: null, right: null });
    expect(state.error).toContain("Motor service not reachable at http://127.0.0.1:50051");
  });

  it("machine.state.get returns live status when client succeeds", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: -0.875,
      detail: "ok",
      measuredPosition: 7,
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    const res = await caller.machine.state.get();
    const state = res.physical!;
    expect(state.connection.cart).toBe(true);
    expect(state.cart.commandedCmPerSec).toBeCloseTo(-0.875);
    expect(state.cart.positionCm).toBeCloseTo(-7 / 232.8, 6);
    expect(state.cart.travelLimitsCm).toEqual({ left: null, right: null });
  });

  it("machine.connect wraps motor errors", async () => {
    vi.mocked(motor.connectMotor).mockRejectedValue(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await expect(caller.machine.connect()).rejects.toThrow(/Connect failed|ECONNREFUSED/);
  });

  it("machine.connect returns motor result on success", async () => {
    vi.mocked(motor.connectMotor).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await expect(caller.machine.connect()).resolves.toEqual({ ok: true, error: "" });
  });

  it("machine.jog.set forwards cm/s to motor", async () => {
    vi.mocked(motor.setJogVelocityCmPerSec).mockResolvedValue({ ok: true, error: "" });
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 0,
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await caller.machine.jog.set({ cmPerSec: -7 });
    expect(motor.setJogVelocityCmPerSec).toHaveBeenCalledWith(-7, {
      maxAccelerationCmPerSec2: undefined,
    });
  });

  it("machine.jog.set blocks jog when left limit is pressed", async () => {
    vi.mocked(motor.setJogVelocityCmPerSec).mockResolvedValue({ ok: true, error: "" });
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 0,
    });
    vi.mocked(sensor.getSensorStatus).mockResolvedValue({
      connected: true,
      ledOn: false,
      detail: "ok",
      serialPort: "COM1",
      encoderTicks: 0,
      limitLeftPressed: true,
      limitRightPressed: false,
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    const res = await caller.machine.jog.set({ cmPerSec: -7 });
    expect(res.ok).toBe(false);
    expect(motor.setJogVelocityCmPerSec).not.toHaveBeenCalled();
  });

  it("machine.travelLimits.recordSide stores limit from cart position", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 42,
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await caller.machine.travelLimits.recordSide({ side: "left" });
    const st = await caller.machine.state.get();
    expect(st.physical!.cart.travelLimitsCm.left).toBeCloseTo(-42 / 232.8, 6);
  });

  it("machine.zeroAtCurrent calls Teknic zero when motor is connected", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 12,
    });
    vi.mocked(motor.zeroMeasuredPosition).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await expect(caller.machine.zeroAtCurrent()).resolves.toEqual({ ok: true });
    expect(motor.zeroMeasuredPosition).toHaveBeenCalledTimes(1);
  });

  it("machine.travelLimits.setSymmetricSpan sets left/right from current position ± half span", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 0,
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    const r = await caller.machine.travelLimits.setSymmetricSpan({ halfSpanCm: 20 });
    expect(r.ok).toBe(true);
    expect(r.centerCm).toBeCloseTo(0, 9);
    expect(r.leftCm).toBeCloseTo(-20, 9);
    expect(r.rightCm).toBeCloseTo(20, 9);
    const st = await caller.machine.state.get();
    expect(st.physical!.cart.travelLimitsCm.left).toBeCloseTo(-20, 6);
    expect(st.physical!.cart.travelLimitsCm.right).toBeCloseTo(20, 6);
  });

  it("machine.zeroAtCurrent zeros simulation display frame", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: 0,
      detail: "ok",
      measuredPosition: 0,
    });
    const caller = appRouter.createCaller({ controlBackend: "simulation" });
    await expect(caller.machine.zeroAtCurrent()).resolves.toEqual({ ok: true });
    const st = await caller.machine.state.get();
    expect(st.simulation!.cart.positionCm).toBeCloseTo(0, 6);
  });

  it("machine.zeroAtCurrent fails when motor is not connected", async () => {
    vi.mocked(motor.zeroMeasuredPosition).mockClear();
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: false,
      commandedCmPerSec: 0,
      detail: "",
    });
    const caller = appRouter.createCaller({ controlBackend: "physical" });
    await expect(caller.machine.zeroAtCurrent()).rejects.toThrow(/Motor is not connected/);
    expect(motor.zeroMeasuredPosition).not.toHaveBeenCalled();
  });

  it("machine.state.get returns physical and simulation sources in twin mode", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedCmPerSec: -0.21,
      detail: "ok",
      measuredPosition: 9,
    });
    const caller = appRouter.createCaller({ controlBackend: "twin" });
    const r = await caller.machine.state.get();
    expect(r.physical!.connection.cart).toBe(true);
    expect(r.physical!.cart.commandedCmPerSec).toBeCloseTo(-3 * 0.0007 * 100);
    expect(r.simulation!.connection.cart).toBe(true);
    expect(r.simulation!.cart.commandedCmPerSec).toBeCloseTo(-3 * 0.0007 * 100);
    expect(r.physical!.cart.travelLimitsCm).toEqual({ left: null, right: null });
    expect(r.simulation!.cart.travelLimitsCm).toEqual({ left: null, right: null });
    expect(r.physical!.cart.positionCm).toBeCloseTo(-9 / 232.8, 6);
  });
});
