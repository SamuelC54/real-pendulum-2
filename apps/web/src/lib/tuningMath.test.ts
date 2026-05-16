import { describe, expect, it } from "vitest";
import { sampleFromCompare, summarizeTuningError } from "./tuningMath";

describe("tuningMath", () => {
  it("sampleFromCompare negates teknic measured to display counts", () => {
    const s = sampleFromCompare({
      real: {
        motor: { connected: true, commandedRpm: 10, measuredPosition: -100 },
        sensor: { encoderTicks: 5, limitLeftPressed: false, limitRightPressed: false },
      },
      sim: {
        motor: { connected: true, commandedRpm: 10, measuredPosition: -90 },
        sensor: { encoderTicks: 6, limitLeftPressed: false, limitRightPressed: false },
      },
    });
    expect(s.realMotorCounts).toBe(100);
    expect(s.simMotorCounts).toBe(90);
    expect(s.realEncoderTicks).toBe(5);
  });

  it("summarizeTuningError scores position and encoder deltas", () => {
    const summary = summarizeTuningError([
      {
        t: 0,
        realMotorCounts: 100,
        simMotorCounts: 90,
        realEncoderTicks: 0,
        simEncoderTicks: 10,
        realCommandedRpm: 0,
        simCommandedRpm: 0,
        realLimitLeft: false,
        realLimitRight: false,
        simLimitLeft: false,
        simLimitRight: false,
      },
    ]);
    expect(summary.meanAbsPosition).toBe(10);
    expect(summary.meanAbsEncoder).toBe(10);
    expect(summary.score).toBeGreaterThan(0);
  });
});
