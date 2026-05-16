import { describe, expect, it } from "vitest";
import {
  sampleFromCompare,
  summarizeTuningError,
} from "./tuningMath";

describe("tuningMath", () => {
  it("sampleFromCompare uses motor positionCm from API", () => {
    const s = sampleFromCompare({
      real: {
        motor: { connected: true, positionCm: 1.5, commandedRpm: 42 },
        sensor: { encoderTicks: 5, limitLeftPressed: false, limitRightPressed: false },
      },
      sim: {
        motor: { connected: true, positionCm: 1.4, commandedRpm: 42 },
        sensor: { encoderTicks: 6, limitLeftPressed: false, limitRightPressed: false },
      },
    });
    expect(s.realMotorCm).toBe(1.5);
    expect(s.simMotorCm).toBe(1.4);
    expect(s.realEncoderTicks).toBe(5);
    expect(s.commandedRpm).toBe(42);
  });

  it("sampleFromCompare prefers hardware commandedRpm when present", () => {
    const s = sampleFromCompare({
      real: {
        motor: { connected: true, commandedRpm: 10 },
        sensor: { encoderTicks: 0, limitLeftPressed: false, limitRightPressed: false },
      },
      sim: {
        motor: { connected: true, commandedRpm: 99 },
        sensor: { encoderTicks: 0, limitLeftPressed: false, limitRightPressed: false },
      },
    });
    expect(s.commandedRpm).toBe(10);
  });

  it("summarizeTuningError scores position and encoder deltas", () => {
    const summary = summarizeTuningError([
      {
        t: 0,
        commandedRpm: 0,
        realMotorCm: 1,
        simMotorCm: 0.9,
        realEncoderTicks: 0,
        simEncoderTicks: 10,
        realLimitLeft: false,
        realLimitRight: false,
        simLimitLeft: false,
        simLimitRight: false,
      },
    ]);
    expect(summary.meanAbsPositionCm).toBeCloseTo(0.1, 5);
    expect(summary.meanAbsEncoder).toBe(10);
    expect(summary.score).toBeGreaterThan(0);
  });
});
