import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveTwinCalibrationStatus,
  resetLiveTwinCalibrationForTests,
  setLiveCalibrationDepsForTests,
  startLiveTwinCalibration,
  stopLiveTwinCalibration,
} from "./liveTwinCalibration.js";
import type { TuningComparePayload } from "./tuningSample.js";
import type { TwinCalibrationParams } from "./twinCalibrationTypes.js";

const baseline: TwinCalibrationParams = {
  mpsPerRpm: 0.00005,
  pendulumLengthM: 0.3,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.1,
};

let compareTick = 0;

const comparePayload = (): TuningComparePayload => {
  compareTick += 1;
  const t = compareTick * 0.01;
  return {
    real: {
      motor: { connected: true, positionCm: t * 10, commandedRpm: 50 },
      sensor: { encoderTicks: compareTick * 2 },
    },
    sim: {
      motor: { connected: true, positionCm: t * 8, commandedRpm: 50 },
      sensor: { encoderTicks: compareTick * 2 + 1 },
    },
  };
};

describe("liveTwinCalibration", () => {
  beforeEach(() => {
    resetLiveTwinCalibrationForTests();
    compareTick = 0;
    setLiveCalibrationDepsForTests({
      fetchCompare: vi.fn(async () => comparePayload()),
      applyRuntimePatch: vi.fn(async () => ({ ok: true })),
      readBaseline: () => ({ ...baseline }),
    });
  });

  afterEach(() => {
    resetLiveTwinCalibrationForTests();
  });

  it("start/stop toggles active flag", async () => {
    expect(getLiveTwinCalibrationStatus().active).toBe(false);
    await startLiveTwinCalibration();
    expect(getLiveTwinCalibrationStatus().active).toBe(true);
    await stopLiveTwinCalibration();
    expect(getLiveTwinCalibrationStatus().active).toBe(false);
  });

  it("collects samples and updates sim runtime", async () => {
    await startLiveTwinCalibration();
    await vi.waitFor(
      () => getLiveTwinCalibrationStatus().windowSampleCount >= 4,
      { timeout: 500 },
    );
    const status = getLiveTwinCalibrationStatus();
    expect(status.windowSampleCount).toBeGreaterThan(0);
    expect(status.metrics.liveEncoderDelta).toBeDefined();
    await stopLiveTwinCalibration();
  });
});
