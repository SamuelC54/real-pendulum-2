import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@real-pendulum/motor-service/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/motor-service/sdk")>();
  return {
    ...actual,
    setJogVelocityRpm: vi.fn(),
    stopMotor: vi.fn(),
  };
});

import * as motor from "@real-pendulum/motor-service/sdk";
import {
  clearMotionLatch,
  registerMotionLatchHandler,
  updateLimitSwitchState,
} from "./motionLatch.js";
import { recoveryJogRpmTowardCenter, startRecoveryJog } from "./motionLatchRecovery.js";
import { withGrpcBackendMode } from "./grpcRequestContext.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("motionLatchRecovery", () => {
  beforeEach(() => {
    clearMotionLatch();
    registerMotionLatchHandler(async () => {});
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
    vi.mocked(motor.setJogVelocityRpm).mockReset().mockResolvedValue({ ok: true, error: "" });
    vi.mocked(motor.stopMotor).mockReset().mockResolvedValue({ ok: true, error: "" });
  });

  it("recoveryJogRpmTowardCenter signs rpm from latch side", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(recoveryJogRpmTowardCenter(50)).toBe(-50);
    clearMotionLatch();
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(recoveryJogRpmTowardCenter(50)).toBe(50);
  });

  it("startRecoveryJog calls motor with toward-center rpm inside bypass", async () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    await withGrpcBackendMode("hardware", () => startRecoveryJog("hardware", { rpm: 40 }));
    expect(motor.setJogVelocityRpm).toHaveBeenCalledWith(-40, expect.any(Object));
  });
});
