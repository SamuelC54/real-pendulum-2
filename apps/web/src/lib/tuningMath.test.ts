import { describe, expect, it } from "vitest";
import {
  applySuggestionToForm,
  sampleFromCompare,
  suggestSimTuning,
  summarizeTuningError,
  type SimConfigForm,
} from "./tuningMath";

const baseForm: SimConfigForm = {
  metersPerDisplayCount: 0.004292,
  mpsPerRpm: 0.0001,
  limitLeftXM: -0.45,
  limitRightXM: 0.45,
  gravity: 9.81,
  pendulumLengthM: 0.3,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.1,
  encoderTicksPerRadian: 381.97,
};

function sample(overrides: Partial<ReturnType<typeof sampleFromCompare>> = {}) {
  return {
    t: 0,
    commandedRpm: 0,
    realMotorCm: 10,
    simMotorCm: 9.5,
    realEncoderTicks: 100,
    simEncoderTicks: 90,
    realLimitLeft: false,
    realLimitRight: false,
    simLimitLeft: false,
    simLimitRight: false,
    ...overrides,
  };
}

function many(n: number, overrides: Parameters<typeof sample>[0] = {}) {
  return Array.from({ length: n }, (_, i) => sample({ ...overrides, t: i }));
}

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

describe("suggestSimTuning", () => {
  it("returns no suggestions with too few samples", () => {
    const r = suggestSimTuning(many(5), baseForm);
    expect(r.suggestions).toHaveLength(0);
  });

  it("suggests lowering metersPerDisplayCount when hardware reads ahead", () => {
    const r = suggestSimTuning(many(20, { realMotorCm: 10.5, simMotorCm: 10 }), baseForm);
    const m = r.suggestions.find((s) => s.param === "metersPerDisplayCount");
    expect(m).toBeDefined();
    expect(m!.suggestedValue).toBeLessThan(baseForm.metersPerDisplayCount);
    expect(m!.direction).toBe("decrease");
  });

  it("suggests raising encoderTicksPerRadian when hardware encoder leads", () => {
    const r = suggestSimTuning(
      many(20, { realMotorCm: 10, simMotorCm: 10, realEncoderTicks: 120, simEncoderTicks: 100 }),
      baseForm,
    );
    const enc = r.suggestions.find((s) => s.param === "encoderTicksPerRadian");
    expect(enc).toBeDefined();
    expect(enc!.suggestedValue).toBeGreaterThan(baseForm.encoderTicksPerRadian);
  });

  it("suggests moving sim left limit when sim triggers early", () => {
    const r = suggestSimTuning(
      many(15, {
        simLimitLeft: true,
        realLimitLeft: false,
      }),
      baseForm,
    );
    const lim = r.suggestions.find((s) => s.param === "limitLeftXM");
    expect(lim).toBeDefined();
    expect(lim!.suggestedValue).toBeLessThan(baseForm.limitLeftXM);
  });

  it("applySuggestionToForm updates one field", () => {
    const suggestion = {
      param: "mpsPerRpm" as const,
      label: "SIM_MPS_PER_RPM",
      direction: "increase" as const,
      currentValue: 1,
      suggestedValue: 1.05,
      confidence: "medium" as const,
      reason: "test",
    };
    expect(applySuggestionToForm(baseForm, suggestion).mpsPerRpm).toBe(1.05);
  });
});
