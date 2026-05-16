import { describe, expect, it } from "vitest";
import { displayCountsPerCm, metersPerDisplayCount } from "./rail.js";

describe("rail scale", () => {
  it("metersPerDisplayCount matches displayCountsPerCm so cm = xM × 100", () => {
    const cpc = displayCountsPerCm();
    const m = metersPerDisplayCount();
    const xM = 0.12;
    const display = xM / m;
    const cm = display / cpc;
    expect(cm).toBeCloseTo(xM * 100, 9);
  });
});
