import { describe, expect, it } from "vitest";
import { sampleFromCompare } from "./tuningSample.js";

describe("tuningSample", () => {
  it("sampleFromCompare uses motor positionCm from API", () => {
    const s = sampleFromCompare({
      real: {
        motor: { connected: true, positionCm: 1.5, commandedRpm: 42 },
        sensor: { encoderTicks: 5 },
      },
      sim: {
        motor: { connected: true, positionCm: 1.4, commandedRpm: 42 },
        sensor: { encoderTicks: 6 },
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
        sensor: { encoderTicks: 0 },
      },
      sim: {
        motor: { connected: true, commandedRpm: 99 },
        sensor: { encoderTicks: 0 },
      },
    });
    expect(s.commandedRpm).toBe(10);
  });
});
