import { afterEach, describe, expect, it } from "vitest";
import {
  cmToDisplayCounts,
  cmToTeknicMeasured,
  displayCountsPerCm,
  displayCountsToCm,
  teknicMeasuredToCm,
} from "./railPositionCm.js";

describe("railPositionCm", () => {
  afterEach(() => {
    delete process.env.RAIL_DISPLAY_COUNTS_PER_CM;
  });

  it("defaults to 232.8 counts per cm", () => {
    expect(displayCountsPerCm()).toBe(232.8);
    expect(displayCountsToCm(232.8)).toBeCloseTo(1, 6);
    expect(cmToDisplayCounts(1)).toBeCloseTo(232.8, 6);
  });

  it("respects RAIL_DISPLAY_COUNTS_PER_CM", () => {
    process.env.RAIL_DISPLAY_COUNTS_PER_CM = "100";
    expect(displayCountsPerCm()).toBe(100);
    expect(displayCountsToCm(50)).toBe(0.5);
  });

  it("maps teknic measured to UI cm (negated display convention)", () => {
    expect(teknicMeasuredToCm(232.8)).toBeCloseTo(-1, 6);
    expect(cmToTeknicMeasured(1)).toBeCloseTo(-232.8, 6);
  });
});
