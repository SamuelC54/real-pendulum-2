import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@real-pendulum/motor-service/sdk", () => ({
  getMotorStatus: vi.fn(),
  setJogVelocityRpm: vi.fn(),
  stopMotor: vi.fn(),
  zeroMeasuredPosition: vi.fn(),
}));

vi.mock("@real-pendulum/sensor-service/sdk", () => ({
  getSensorStatus: vi.fn(),
}));

import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { runRailHoming } from "./homing.js";

describe("runRailHoming", () => {
  beforeEach(() => {
    vi.mocked(motor.getMotorStatus).mockReset();
    vi.mocked(motor.setJogVelocityRpm).mockReset();
    vi.mocked(motor.stopMotor).mockReset().mockResolvedValue({ ok: true, error: "" });
    vi.mocked(motor.zeroMeasuredPosition).mockReset().mockResolvedValue({ ok: true, error: "" });
    vi.mocked(sensor.getSensorStatus).mockReset();
  });

  it("fails when motor is not connected", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: false,
      commandedRpm: 0,
      detail: "",
    });
    const r = await runRailHoming();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Motor is not connected/);
    expect(motor.setJogVelocityRpm).not.toHaveBeenCalled();
  });

  it("fails when sensor is not connected", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 0,
      detail: "",
      measuredPosition: 0,
    });
    vi.mocked(sensor.getSensorStatus).mockResolvedValue({
      connected: false,
      ledOn: false,
      detail: "",
      serialPort: "",
      encoderTicks: 0,
      limitLeftPressed: false,
      limitRightPressed: false,
    });
    const r = await runRailHoming();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Sensor Board is not connected/);
    expect(motor.setJogVelocityRpm).not.toHaveBeenCalled();
  });

  it("fails when motor measured position is not reported", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 0,
      detail: "",
    });
    const r = await runRailHoming();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/measured position unavailable/);
    expect(motor.setJogVelocityRpm).not.toHaveBeenCalled();
  });
});
