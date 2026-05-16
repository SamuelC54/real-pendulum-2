import { describe, expect, it } from "vitest";
import { buildTuningChartRows, downsampleTuningSamples } from "./tuningRecordChartData";
import type { TuningSample } from "./tuningMath";

function sample(i: number): TuningSample {
  return {
    t: i * 10,
    commandedRpm: i,
    realMotorCm: i / 10,
    simMotorCm: i / 10 + 0.1,
    realEncoderTicks: i * 2,
    simEncoderTicks: i * 2 + 1,
  };
}

describe("tuningRecordChartData", () => {
  it("downsampleTuningSamples caps length", () => {
    const many = Array.from({ length: 5000 }, (_, i) => sample(i));
    expect(downsampleTuningSamples(many, 100)).toHaveLength(100);
  });

  it("buildTuningChartRows maps recharts fields", () => {
    const rows = buildTuningChartRows([sample(0), sample(1), sample(2)]);
    expect(rows[0]?.tSec).toBe(0);
    expect(rows[2]?.tSec).toBeCloseTo(0.02, 5);
    expect(rows[1]?.commandedRpm).toBe(1);
    expect(rows[1]?.realMotorCm).toBeCloseTo(0.1, 5);
  });
});
