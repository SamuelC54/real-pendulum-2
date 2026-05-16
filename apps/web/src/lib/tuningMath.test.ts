import { describe, expect, it } from "vitest";
import {
  applySuggestionToForm,
  sampleFromCompare,
  suggestSimTuning,
  summarizeTuningError,
  type SimConfigForm,
} from "./tuningMath";

const baseForm: SimConfigForm = {
  mpsPerRpm: 0.0001,
  limitLeftXM: -0.45,
  limitRightXM: 0.45,
  pendulumLengthM: 0.3,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.1,
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

  it("does not suggest metersPerDisplayCount (tied to hardware rail config)", () => {
    const r = suggestSimTuning(many(20, { realMotorCm: 10.5, simMotorCm: 10 }), baseForm);
    expect(r.suggestions.find((s) => s.param === "metersPerDisplayCount")).toBeUndefined();
  });

  it("does not suggest encoderTicksPerRadian (tied to hardware pendulum config)", () => {
    const r = suggestSimTuning(
      many(20, { realMotorCm: 10, simMotorCm: 10, realEncoderTicks: 120, simEncoderTicks: 100 }),
      baseForm,
    );
    expect(r.suggestions.find((s) => s.param === "encoderTicksPerRadian")).toBeUndefined();
  });

  it("suggests mpsPerRpm when jog motion scale mismatches", () => {
    const samples = Array.from({ length: 24 }, (_, i) =>
      sample({
        t: i,
        commandedRpm: 50,
        realMotorCm: i * 0.35,
        simMotorCm: i * 0.35 * 0.92,
        realEncoderTicks: 0,
        simEncoderTicks: 0,
      }),
    );
    const r = suggestSimTuning(samples, baseForm);
    const mps = r.suggestions.find((s) => s.param === "mpsPerRpm");
    expect(mps).toBeDefined();
    expect(mps!.suggestedValue).toBeGreaterThan(baseForm.mpsPerRpm);
    expect(r.diagnostics.positionDisplacementScale).toBeCloseTo(1 / 0.92, 2);
  });

  it("does not suggest mpsPerRpm when motion scale already matches", () => {
    const samples = Array.from({ length: 24 }, (_, i) =>
      sample({
        t: i,
        commandedRpm: 50,
        realMotorCm: i * 0.4 + 0.3,
        simMotorCm: i * 0.4 + 0.3,
      }),
    );
    const r = suggestSimTuning(samples, baseForm);
    expect(r.suggestions.find((s) => s.param === "mpsPerRpm")).toBeUndefined();
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
