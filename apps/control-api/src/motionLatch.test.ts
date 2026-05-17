import { beforeEach, describe, expect, it, vi } from "vitest";
import { withGrpcBackendMode } from "./grpcRequestContext.js";
import {
  clearMotionLatch,
  clampJogRpmForMotionLatch,
  getMotionLatchStatus,
  guardMoveWhenLatched,
  registerMotionLatchHandler,
  isMotionBlockedByLatch,
  runWithHomingBypass,
  runWithRecoveryMoveBypass,
  tryClearMotionLatchIfSafe,
  updateLimitSwitchState,
  updateMotorPositionForLatch,
} from "./motionLatch.js";
import {
  resetTravelLimitsStateForTests,
  setTravelLimitsSymmetricAboutCm,
} from "./railTravelLimits.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("motionLatch", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
    clearMotionLatch();
    registerMotionLatchHandler(async () => {});
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
  });

  it("latches on rising edge when not homing", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getMotionLatchStatus().latched).toBe(true);
    expect(getMotionLatchStatus().side).toBe("left");
    expect(getMotionLatchStatus().towardCenterJog).toBe("right");
  });

  it("does not latch while homing bypass is active", async () => {
    await runWithHomingBypass(async () => {
      updateLimitSwitchState({ ...limits, limitLeftPressed: true });
      expect(getMotionLatchStatus().latched).toBe(false);
    });
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getMotionLatchStatus().latched).toBe(true);
  });

  it("invokes stop handler once on latch", () => {
    const stop = vi.fn(async () => {});
    registerMotionLatchHandler(stop);
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(stop).toHaveBeenCalledTimes(1);
    updateLimitSwitchState({ ...limits, limitLeftPressed: false });
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("latches when position is outside recorded travel limits", () => {
    withGrpcBackendMode("hardware", () => {
      setTravelLimitsSymmetricAboutCm(0, 10);
      updateMotorPositionForLatch(-11);
      expect(getMotionLatchStatus().latched).toBe(true);
      expect(getMotionLatchStatus().side).toBe("left");
      expect(getMotionLatchStatus().reason).toBe("position");
    });
  });

  it("does not latch on position when travel limits are unknown", () => {
    updateMotorPositionForLatch(999);
    expect(getMotionLatchStatus().latched).toBe(false);
  });

  it("does not latch on position while homing bypass is active", async () => {
    await withGrpcBackendMode("hardware", async () => {
      setTravelLimitsSymmetricAboutCm(0, 10);
      await runWithHomingBypass(async () => {
        updateMotorPositionForLatch(99);
        expect(getMotionLatchStatus().latched).toBe(false);
      });
    });
  });

  it("clampJogRpmForMotionLatch blocks further into limit, allows toward center", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(clampJogRpmForMotionLatch(120)).toBe(0);
    expect(clampJogRpmForMotionLatch(-120)).toBe(-120);
    clearMotionLatch();
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(clampJogRpmForMotionLatch(-120)).toBe(0);
    expect(clampJogRpmForMotionLatch(120)).toBe(120);
  });

  it("guardMoveWhenLatched allows moves toward center", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(guardMoveWhenLatched(0, -5)).toBeNull();
    expect(guardMoveWhenLatched(-6, -5)).not.toBeNull();
    clearMotionLatch();
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(guardMoveWhenLatched(0, 5)).toBeNull();
    expect(guardMoveWhenLatched(6, 5)).not.toBeNull();
  });

  it("isMotionBlockedByLatch false during recovery bypass while still latched", async () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getMotionLatchStatus().latched).toBe(true);
    await runWithRecoveryMoveBypass(async () => {
      expect(isMotionBlockedByLatch()).toBe(false);
    });
    expect(isMotionBlockedByLatch()).toBe(true);
  });

  it("tryClearMotionLatchIfSafe clears when in range and switches open", () => {
    withGrpcBackendMode("hardware", () => {
      setTravelLimitsSymmetricAboutCm(0, 10);
      updateMotorPositionForLatch(-11);
      expect(getMotionLatchStatus().latched).toBe(true);
      tryClearMotionLatchIfSafe(0, limits);
      expect(getMotionLatchStatus().latched).toBe(false);
    });
  });

  it("tryClearMotionLatchIfSafe keeps latch when a switch is pressed", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    tryClearMotionLatchIfSafe(0, { ...limits, limitLeftPressed: true });
    expect(getMotionLatchStatus().latched).toBe(true);
  });

  it("clearMotionLatch allows re-latch after switches clear", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    clearMotionLatch();
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(getMotionLatchStatus().latched).toBe(true);
    expect(getMotionLatchStatus().side).toBe("right");
  });
});
