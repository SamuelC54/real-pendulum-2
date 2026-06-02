import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLimitSwitchMode,
  getLimitSwitchModeStatus,
  isMotionBlocked,
  registerOnEngage,
  runWithHomingBypass,
  runWithRecoveryBypass,
  tryClearIfSafe,
  updateLimitSwitchState,
  updateMotorPosition,
} from "./state.js";
import {
  physicalBackend,
  resetTravelLimitsStateForTests,
} from "../control/backends/instances.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("limitSwitchMode", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
    clearLimitSwitchMode();
    registerOnEngage(async () => {});
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
  });

  it("latches on rising edge when not homing", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getLimitSwitchModeStatus().latched).toBe(true);
    expect(getLimitSwitchModeStatus().side).toBe("left");
    expect(getLimitSwitchModeStatus().towardCenterJog).toBe("right");
  });

  it("does not latch while homing bypass is active", async () => {
    await runWithHomingBypass(async () => {
      updateLimitSwitchState({ ...limits, limitLeftPressed: true });
      expect(getLimitSwitchModeStatus().latched).toBe(false);
    });
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getLimitSwitchModeStatus().latched).toBe(true);
  });

  it("invokes stop handler once on latch", () => {
    const stop = vi.fn(async () => {});
    registerOnEngage(stop);
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(stop).toHaveBeenCalledTimes(1);
    updateLimitSwitchState({ ...limits, limitLeftPressed: false });
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("latches when position is outside recorded travel limits", () => {
    physicalBackend.travelLimits.setSymmetricAboutCm(0, 10);
    updateMotorPosition(-11, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(true);
    expect(getLimitSwitchModeStatus().side).toBe("left");
    expect(getLimitSwitchModeStatus().reason).toBe("position");
  });

  it("does not latch on position when travel limits are unknown", () => {
    updateMotorPosition(999, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(false);
  });

  it("does not latch on position while homing bypass is active", async () => {
    physicalBackend.travelLimits.setSymmetricAboutCm(0, 10);
    await runWithHomingBypass(async () => {
      updateMotorPosition(99, physicalBackend.getTravelLimits());
      expect(getLimitSwitchModeStatus().latched).toBe(false);
    });
  });

  it("isMotionBlocked false during recovery bypass while still latched", async () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    expect(getLimitSwitchModeStatus().latched).toBe(true);
    await runWithRecoveryBypass(async () => {
      expect(isMotionBlocked()).toBe(false);
    });
    expect(isMotionBlocked()).toBe(true);
  });

  it("tryClearIfSafe clears when in range and switches open", () => {
    physicalBackend.travelLimits.setSymmetricAboutCm(0, 10);
    updateMotorPosition(-11, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(true);
    tryClearIfSafe(0, limits, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(false);
  });

  it("tryClearIfSafe keeps latch when a switch is pressed", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    tryClearIfSafe(0, { ...limits, limitLeftPressed: true }, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(true);
  });

  it("clearLimitSwitchMode allows re-latch after switches clear", () => {
    updateLimitSwitchState({ ...limits, limitLeftPressed: true });
    clearLimitSwitchMode();
    updateLimitSwitchState({ ...limits, limitLeftPressed: false, limitRightPressed: false });
    updateLimitSwitchState({ ...limits, limitRightPressed: true });
    expect(getLimitSwitchModeStatus().latched).toBe(true);
    expect(getLimitSwitchModeStatus().side).toBe("right");
  });
});
