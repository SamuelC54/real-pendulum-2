import { describe, expect, it } from "vitest";
import {
  isJogBlockedByMotionLatch,
  isJogBlockedByTravelLimit,
  isMoveTargetBlockedByMotionLatch,
  JOG_RPM,
  jogRpmForDirection,
  shouldReleaseJogHoldForMotionLatch,
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

  it("motion latch blocks jog into limit, allows toward center", () => {
    const latch = { latched: true, side: "left" as const, towardCenterJog: "right" as const };
    expect(isJogBlockedByMotionLatch("left", latch)).toBe(true);
    expect(isJogBlockedByMotionLatch("right", latch)).toBe(false);
    expect(shouldReleaseJogHoldForMotionLatch("left", latch)).toBe(true);
    expect(isMoveTargetBlockedByMotionLatch(-6, -5, latch)).toBe(true);
    expect(isMoveTargetBlockedByMotionLatch(0, -5, latch)).toBe(false);
  });

  it("travel limit allows toward-center jog while latched even if switch still pressed", () => {
    const limits = { connected: true, limitLeftPressed: true, limitRightPressed: false };
    const latch = { latched: true, side: "left" as const, towardCenterJog: "right" as const };
    expect(isJogBlockedByTravelLimit("right", limits, latch)).toBe(false);
    expect(isJogBlockedByTravelLimit("left", limits, latch)).toBe(true);
  });
});
