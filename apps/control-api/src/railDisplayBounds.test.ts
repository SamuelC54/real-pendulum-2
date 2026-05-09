import { describe, expect, it, beforeEach } from "vitest";
import {
  getRailDisplayBounds,
  resetRailDisplayBounds,
  resetRailDisplayBoundsStateForTests,
  syncRailDisplayBoundsFromMotorStatus,
} from "./railDisplayBounds.js";

describe("railDisplayBounds", () => {
  beforeEach(() => {
    resetRailDisplayBoundsStateForTests();
  });

  it("clears when motor disconnected", () => {
    syncRailDisplayBoundsFromMotorStatus(true, 10);
    expect(getRailDisplayBounds()).toEqual({ min: -10, max: -10 });
    syncRailDisplayBoundsFromMotorStatus(false, undefined);
    expect(getRailDisplayBounds()).toBeNull();
  });

  it("expands min/max with display counts (-Teknic)", () => {
    syncRailDisplayBoundsFromMotorStatus(true, 100);
    expect(getRailDisplayBounds()).toEqual({ min: -100, max: -100 });
    syncRailDisplayBoundsFromMotorStatus(true, 50);
    expect(getRailDisplayBounds()).toEqual({ min: -100, max: -50 });
  });

  it("ignores samples while connected but position missing", () => {
    syncRailDisplayBoundsFromMotorStatus(true, 10);
    syncRailDisplayBoundsFromMotorStatus(true, undefined);
    expect(getRailDisplayBounds()).toEqual({ min: -10, max: -10 });
  });

  it("reset sets both ends", () => {
    syncRailDisplayBoundsFromMotorStatus(true, 0);
    syncRailDisplayBoundsFromMotorStatus(true, 100);
    resetRailDisplayBounds(42);
    expect(getRailDisplayBounds()).toEqual({ min: 42, max: 42 });
  });
});
