import { config } from "@real-pendulum/app-config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cmToDisplayCounts,
  cmToTeknicMeasured,
  displayCountsPerCm,
  displayCountsToCm,
  teknicMeasuredToCm,
} from "./railPositionCm.js";

describe("railPositionCm", () => {
  let savedCountsPerCm: number;

  beforeEach(() => {
    savedCountsPerCm = config.rail.displayCountsPerCm;
  });

  afterEach(() => {
    config.rail.displayCountsPerCm = savedCountsPerCm;
  });

  it("defaults to 232.8 counts per cm", () => {
    config.rail.displayCountsPerCm = 232.8;
    expect(displayCountsPerCm()).toBe(232.8);
    expect(displayCountsToCm(232.8)).toBeCloseTo(1, 6);
    expect(cmToDisplayCounts(1)).toBeCloseTo(232.8, 6);
  });

  it("respects config.rail.displayCountsPerCm", () => {
    config.rail.displayCountsPerCm = 100;
    expect(displayCountsPerCm()).toBe(100);
    expect(displayCountsToCm(50)).toBe(0.5);
  });

  it("maps teknic measured to UI cm (negated display convention)", () => {
    config.rail.displayCountsPerCm = 232.8;
    expect(teknicMeasuredToCm(232.8)).toBeCloseTo(-1, 6);
    expect(cmToTeknicMeasured(1)).toBeCloseTo(-232.8, 6);
  });
});
