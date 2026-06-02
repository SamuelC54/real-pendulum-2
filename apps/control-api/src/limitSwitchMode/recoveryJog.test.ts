import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@real-pendulum/physical-motor-service/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/physical-motor-service/sdk")>();
  return {
    ...actual,
    setJogVelocityCmPerSec: vi.fn(),
    stopMotor: vi.fn(),
  };
});

import * as motor from "@real-pendulum/physical-motor-service/sdk";
import { clearLimitSwitchMode, registerOnEngage, updateLimitSwitchState } from "./state.js";
import { recoveryJogCmPerSecTowardCenter, startRecoveryJog } from "./recoveryJog.js";
import { withControlBackend } from "../helpers/backendContext.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("recoveryJog", () => {
  beforeEach(() => {
    clearLimitSwitchMode();
    registerOnEngage(async () => {});
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
    vi.mocked(motor.setJogVelocityCmPerSec).mockReset().mockResolvedValue({ ok: true, error: "" });
    vi.mocked(motor.stopMotor).mockReset().mockResolvedValue({ ok: true, error: "" });
  });

  it("recoveryJogCmPerSecTowardCenter signs cm/s from latch side", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(recoveryJogCmPerSecTowardCenter(5)).toBe(-5);
    clearLimitSwitchMode();
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(recoveryJogCmPerSecTowardCenter(5)).toBe(5);
  });

  it("startRecoveryJog calls motor with toward-center cm/s inside bypass", async () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    await withControlBackend("physical", () => startRecoveryJog("physical", { cmPerSec: 4 }));
    expect(motor.setJogVelocityCmPerSec).toHaveBeenCalledWith(
      -4,
      expect.objectContaining({ maxAccelerationCmPerSec2: expect.any(Number) }),
    );
  });
});
