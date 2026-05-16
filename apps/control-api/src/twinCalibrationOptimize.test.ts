import { describe, expect, it } from "vitest";
import { estimateMpsPerRpmFromTravel, fitTwinCalibrationParams } from "./twinCalibrationOptimize.js";
import { replayTwinTrace } from "./tuningReplay.js";
import type { TuningSample } from "./tuningSample.js";
import type { TwinCalibrationParams } from "./twinCalibrationTypes.js";

const trueParams: TwinCalibrationParams = {
  mpsPerRpm: 0.00006,
  pendulumLengthM: 0.3,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.1,
};

function synthesizeSamples(params: TwinCalibrationParams, n: number, rpm: number): TuningSample[] {
  const template: TuningSample[] = Array.from({ length: n }, (_, i) => ({
    t: i * 50,
    commandedRpm: rpm,
    realMotorCm: 0,
    simMotorCm: null,
    realEncoderTicks: 0,
    simEncoderTicks: 0,
  }));
  const trace = replayTwinTrace(template, params);
  return template.map((s, i) => ({
    ...s,
    realMotorCm: trace[i]!.motorCm,
    realEncoderTicks: trace[i]!.encoderTicks,
    simMotorCm: trace[i]!.motorCm + 0.4,
    simEncoderTicks: trace[i]!.encoderTicks,
  }));
}

describe("twinCalibrationOptimize", () => {
  it("estimateMpsPerRpmFromTravel scales toward true speed", () => {
    const samples = synthesizeSamples(trueParams, 20, 60);
    const wrong = { ...trueParams, mpsPerRpm: 0.00004 };
    const est = estimateMpsPerRpmFromTravel(samples, wrong);
    expect(est).toBeGreaterThan(wrong.mpsPerRpm);
    expect(est).toBeCloseTo(trueParams.mpsPerRpm, 4);
  });

  it("fitTwinCalibrationParams improves replay score", () => {
    const samples = synthesizeSamples(trueParams, 24, 80);
    const guess = { ...trueParams, mpsPerRpm: 0.00004 };
    const fit = fitTwinCalibrationParams(samples, guess);
    expect(fit).not.toBeNull();
    expect(fit!.score).toBeLessThan(0.5);
  });
});
