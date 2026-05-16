import { describe, expect, it, beforeEach } from "vitest";
import { withGrpcBackendMode } from "./grpcRequestContext.js";
import {
  clearTravelLimits,
  getTravelLimitDisplays,
  recordTravelLimitFromTeknicMeasured,
  resetTravelLimitsStateForTests,
  setTravelLimitsFromHoming,
  syncTravelLimitsFromMotorConnection,
} from "./railTravelLimits.js";

describe("railTravelLimits", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
  });

  it("clears when motor disconnect sync runs", () => {
    recordTravelLimitFromTeknicMeasured(100, "left");
    expect(getTravelLimitDisplays().left).toBe(-100);
    syncTravelLimitsFromMotorConnection(false);
    expect(getTravelLimitDisplays()).toEqual({ left: null, right: null });
  });

  it("does not clear while connected", () => {
    recordTravelLimitFromTeknicMeasured(100, "left");
    syncTravelLimitsFromMotorConnection(true);
    expect(getTravelLimitDisplays().left).toBe(-100);
  });

  it("after homing with zero at mid, limits are symmetric in display counts", () => {
    const posAtLeft = 7542;
    const posAtRight = -7531;
    setTravelLimitsFromHoming(posAtLeft, posAtRight, true);
    const { left, right } = getTravelLimitDisplays();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left! + right!).toBe(0);
    expect(Math.abs(left!)).toBeCloseTo(Math.abs(right!), 9);
  });

  it("without zero at mid uses raw display at each trip", () => {
    setTravelLimitsFromHoming(100, -50, false);
    expect(getTravelLimitDisplays()).toEqual({ left: -100, right: 50 });
  });

  it("isolates travel limits between hardware and sim backend modes", () => {
    recordTravelLimitFromTeknicMeasured(10, "left");
    expect(getTravelLimitDisplays().left).toBe(-10);
    withGrpcBackendMode("sim", () => {
      recordTravelLimitFromTeknicMeasured(20, "left");
      expect(getTravelLimitDisplays().left).toBe(-20);
    });
    expect(getTravelLimitDisplays().left).toBe(-10);
  });
});
