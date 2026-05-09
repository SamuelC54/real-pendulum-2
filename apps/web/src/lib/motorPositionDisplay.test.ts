import { describe, expect, it } from "vitest";
import { motorCountsForDisplay } from "./motorPositionDisplay";

describe("motorCountsForDisplay", () => {
  it("negates finite Teknic counts", () => {
    expect(motorCountsForDisplay(120)).toBe(-120);
    expect(motorCountsForDisplay(-50)).toBe(50);
  });

  it("returns undefined for invalid input", () => {
    expect(motorCountsForDisplay(undefined)).toBeUndefined();
    expect(motorCountsForDisplay(Number.NaN)).toBeUndefined();
  });
});
