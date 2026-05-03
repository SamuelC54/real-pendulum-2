import { describe, expect, it } from "vitest";
import { JOG_RPM, jogRpmForDirection } from "./jogMath";

describe("jogMath", () => {
  it("uses symmetric rpm magnitude", () => {
    expect(Math.abs(jogRpmForDirection("left"))).toBe(JOG_RPM);
    expect(Math.abs(jogRpmForDirection("right"))).toBe(JOG_RPM);
  });

  it("negates rpm for left", () => {
    expect(jogRpmForDirection("left")).toBe(-JOG_RPM);
    expect(jogRpmForDirection("right")).toBe(JOG_RPM);
  });
});
