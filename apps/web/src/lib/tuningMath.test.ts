import { describe, expect, it } from "vitest";
import { summarizeTuningError } from "./tuningMath";

describe("tuningMath", () => {
  it("summarizeTuningError scores position and encoder deltas", () => {
    const summary = summarizeTuningError([
      {
        t: 0,
        commandedRpm: 0,
        realMotorCm: 1,
        simMotorCm: 0.9,
        realEncoderTicks: 0,
        simEncoderTicks: 10,
      },
    ]);
    expect(summary.meanAbsPositionCm).toBeCloseTo(0.1, 5);
    expect(summary.meanAbsEncoder).toBe(10);
    expect(summary.score).toBeGreaterThan(0);
  });
});
