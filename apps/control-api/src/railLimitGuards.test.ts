import { describe, expect, it } from "vitest";
import {
  clampJogCmPerSecForTravelLimits,
  guardMoveAbsolutePositionCm,
} from "./railLimitGuards.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("clampJogCmPerSecForTravelLimits", () => {
  it("blocks negative cm/s when left limit is pressed", () => {
    expect(
      clampJogCmPerSecForTravelLimits(-7, { ...limits, limitLeftPressed: true }),
    ).toBe(0);
  });

  it("blocks positive cm/s when right limit is pressed", () => {
    expect(
      clampJogCmPerSecForTravelLimits(7, { ...limits, limitRightPressed: true }),
    ).toBe(0);
  });

  it("allows stop and motion away from limits", () => {
    expect(clampJogCmPerSecForTravelLimits(0, { ...limits, limitLeftPressed: true })).toBe(0);
    expect(clampJogCmPerSecForTravelLimits(7, { ...limits, limitLeftPressed: true })).toBe(7);
    expect(clampJogCmPerSecForTravelLimits(-7, { ...limits, limitRightPressed: true })).toBe(-7);
  });

  it("does not clamp when sensor is disconnected", () => {
    expect(
      clampJogCmPerSecForTravelLimits(-7, {
        connected: false,
        limitLeftPressed: true,
        limitRightPressed: false,
      }),
    ).toBe(-7);
  });
});

describe("guardMoveAbsolutePositionCm", () => {
  it("blocks further left when left limit is active", () => {
    expect(
      guardMoveAbsolutePositionCm(-2, { ...limits, limitLeftPressed: true }, -1),
    ).toMatch(/left/i);
  });

  it("blocks further right when right limit is active", () => {
    expect(
      guardMoveAbsolutePositionCm(2, { ...limits, limitRightPressed: true }, 1),
    ).toMatch(/right/i);
  });

  it("allows moves away from an active limit", () => {
    expect(
      guardMoveAbsolutePositionCm(0, { ...limits, limitLeftPressed: true }, -1),
    ).toBeNull();
  });
});
