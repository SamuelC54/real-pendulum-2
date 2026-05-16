import { describe, expect, it } from "vitest";
import {
  clampJogRpmForTravelLimits,
  guardMoveAbsolutePositionCm,
} from "./railLimitGuards.js";

const limits = {
  connected: true,
  limitLeftPressed: false,
  limitRightPressed: false,
};

describe("clampJogRpmForTravelLimits", () => {
  it("blocks positive rpm when left limit is pressed", () => {
    expect(
      clampJogRpmForTravelLimits(120, { ...limits, limitLeftPressed: true }),
    ).toBe(0);
  });

  it("blocks negative rpm when right limit is pressed", () => {
    expect(
      clampJogRpmForTravelLimits(-120, { ...limits, limitRightPressed: true }),
    ).toBe(0);
  });

  it("allows stop and motion away from limits", () => {
    expect(clampJogRpmForTravelLimits(0, { ...limits, limitLeftPressed: true })).toBe(0);
    expect(clampJogRpmForTravelLimits(-50, { ...limits, limitLeftPressed: true })).toBe(-50);
    expect(clampJogRpmForTravelLimits(50, { ...limits, limitRightPressed: true })).toBe(50);
  });

  it("does not clamp when sensor is disconnected", () => {
    expect(
      clampJogRpmForTravelLimits(120, { connected: false, limitLeftPressed: true, limitRightPressed: false }),
    ).toBe(120);
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
