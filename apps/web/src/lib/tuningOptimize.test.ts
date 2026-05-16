import { describe, expect, it } from "vitest";
import { optimizeSimTuning } from "@/lib/tuningOptimize";
import { replayTuningLoss, replayTwinTrace } from "@/lib/tuningReplay";
import { DEFAULT_TUNING_WEIGHTS, type SimConfigForm, type TuningSample } from "@/lib/tuningMath";

const baseForm: SimConfigForm = {
  mpsPerRpm: 0.00005,
  pendulumLengthM: 0.3,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.1,
};

/** Recorded hardware trace = plant replay at `form`; sim columns are intentionally offset. */
function synthesizeSamples(form: SimConfigForm, n: number, rpm: number): TuningSample[] {
  const template: TuningSample[] = Array.from({ length: n }, (_, i) => ({
    t: i * 100,
    commandedRpm: rpm,
    realMotorCm: 0,
    simMotorCm: null,
    realEncoderTicks: 0,
    simEncoderTicks: 0,
    realLimitLeft: false,
    realLimitRight: false,
    simLimitLeft: false,
    simLimitRight: false,
  }));
  const trace = replayTwinTrace(template, form);
  return template.map((s, i) => ({
    ...s,
    realMotorCm: trace[i]!.motorCm,
    realEncoderTicks: trace[i]!.encoderTicks,
    realLimitLeft: trace[i]!.limitLeft,
    realLimitRight: trace[i]!.limitRight,
    simMotorCm: trace[i]!.motorCm + 0.5,
    simEncoderTicks: trace[i]!.encoderTicks,
    simLimitLeft: trace[i]!.limitLeft,
    simLimitRight: trace[i]!.limitRight,
  }));
}

describe("optimizeSimTuning", () => {
  it("returns null with too few samples", () => {
    expect(optimizeSimTuning([], baseForm)).toBeNull();
  });

  it("lowers replay loss for mismatched mpsPerRpm", () => {
    const trueForm = { ...baseForm, mpsPerRpm: 0.00006 };
    const samples = synthesizeSamples(trueForm, 24, 80);
    const wrong = { ...trueForm, mpsPerRpm: 0.00004 };
    const before = replayTuningLoss(samples, wrong, DEFAULT_TUNING_WEIGHTS);
    const result = optimizeSimTuning(samples, wrong, DEFAULT_TUNING_WEIGHTS);
    expect(result).not.toBeNull();
    expect(result!.diagnostics.optimizedScore).toBeLessThan(before);
    expect(result!.optimized.mpsPerRpm).toBeGreaterThan(wrong.mpsPerRpm);
    expect(result!.changes.some((c) => c.param === "mpsPerRpm")).toBe(true);
  });

  it("finds parameters close to generating values on synthetic jog", () => {
    const trueForm = { ...baseForm, mpsPerRpm: 0.000055 };
    const samples = synthesizeSamples(trueForm, 30, 100);
    const guess = { ...trueForm, mpsPerRpm: 0.00004, cartVelocityTrackingPerSec: 10 };
    const result = optimizeSimTuning(samples, guess, DEFAULT_TUNING_WEIGHTS);
    expect(result).not.toBeNull();
    expect(result!.optimized.mpsPerRpm).toBeCloseTo(trueForm.mpsPerRpm, 3);
    expect(result!.diagnostics.scoreImprovement).toBeGreaterThan(0);
  });
});
