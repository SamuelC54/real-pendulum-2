import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTuningSamples,
  getTuningRecordStatus,
  getTuningSamples,
  resetTuningRecordForTests,
  setTuningRecordDepsForTests,
  startTuningRecord,
  stopTuningRecord,
} from "./tuningRecord.js";
import type { TuningComparePayload } from "./tuningSample.js";

const comparePayload: TuningComparePayload = {
  real: {
    motor: { connected: true, positionCm: 1, commandedRpm: 50 },
    sensor: { encoderTicks: 10 },
  },
  sim: {
    motor: { connected: true, positionCm: 1.1, commandedRpm: 50 },
    sensor: { encoderTicks: 11 },
  },
};

describe("tuningRecord", () => {
  beforeEach(() => {
    resetTuningRecordForTests();
    setTuningRecordDepsForTests({
      fetchCompare: vi.fn(async () => comparePayload),
    });
  });

  afterEach(() => {
    resetTuningRecordForTests();
  });

  it("start/stop toggles recording flag", () => {
    expect(getTuningRecordStatus().recording).toBe(false);
    startTuningRecord();
    expect(getTuningRecordStatus().recording).toBe(true);
    stopTuningRecord();
    expect(getTuningRecordStatus().recording).toBe(false);
  });

  it("captures samples while recording", async () => {
    startTuningRecord();
    await vi.waitFor(() => getTuningSamples().length > 0, { timeout: 200 });
    stopTuningRecord();
    expect(getTuningSamples().length).toBeGreaterThan(0);
    expect(getTuningSamples()[0]?.realMotorCm).toBe(1);
  });

  it("clear removes samples", async () => {
    startTuningRecord();
    await vi.waitFor(() => getTuningSamples().length > 0, { timeout: 200 });
    stopTuningRecord();
    clearTuningSamples();
    expect(getTuningSamples()).toHaveLength(0);
  });
});
