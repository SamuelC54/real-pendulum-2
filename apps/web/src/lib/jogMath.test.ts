import { describe, expect, it } from "vitest";
import {
  isJogBlockedByTravelLimit,
  JOG_RPM,
  jogRpmForDirection,
  shouldReleaseJogHoldForTravelLimit,
} from "./jogMath";

describe("jogMath", () => {
  it("uses symmetric rpm magnitude", () => {
    expect(Math.abs(jogRpmForDirection("left"))).toBe(JOG_RPM);
    expect(Math.abs(jogRpmForDirection("right"))).toBe(JOG_RPM);
  });

  it("signs match rail jog labels vs Teknic velocity convention", () => {
    expect(jogRpmForDirection("left")).toBe(JOG_RPM);
    expect(jogRpmForDirection("right")).toBe(-JOG_RPM);
  });

  it("uses custom magnitude from sliders", () => {
    expect(jogRpmForDirection("left", 80)).toBe(80);
    expect(jogRpmForDirection("right", 80)).toBe(-80);
  });

  it("shouldReleaseJogHoldForTravelLimit when hold direction hits a switch", () => {
    const limits = { connected: true, limitLeftPressed: true, limitRightPressed: false };
    expect(shouldReleaseJogHoldForTravelLimit("left", limits)).toBe(true);
    expect(shouldReleaseJogHoldForTravelLimit("right", limits)).toBe(false);
    expect(isJogBlockedByTravelLimit("left", limits)).toBe(true);
  });
});
