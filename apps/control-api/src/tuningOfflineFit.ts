import { replayCalibrationLoss, summarizeReplayError } from "./tuningReplay.js";
import type { TuningSample } from "./tuningSample.js";
import { fitTwinCalibrationParams } from "./twinCalibrationOptimize.js";
import type { TwinCalibrationParams, TwinCalibrationWeights } from "./twinCalibrationTypes.js";

export const MIN_OFFLINE_FIT_SAMPLES = 8;

export type OfflineFitChange = {
  param: keyof TwinCalibrationParams;
  label: string;
  currentValue: number;
  optimizedValue: number;
};

export type OfflineFitResult = {
  current: TwinCalibrationParams;
  optimized: TwinCalibrationParams;
  changes: OfflineFitChange[];
  diagnostics: {
    sampleCount: number;
    baselineScore: number;
    optimizedScore: number;
    scoreImprovement: number;
    meanAbsPositionCm: number | null;
    meanAbsEncoder: number;
  };
};

const PARAM_LABELS: Record<keyof TwinCalibrationParams, string> = {
  mpsPerRpm: "SIM_MPS_PER_RPM",
  pendulumLengthM: "Pendulum length (m)",
  cartVelocityTrackingPerSec: "Cart velocity tracking α (1/s)",
  angularDampingPerSec: "Angular damping (1/s)",
};

function buildChanges(
  current: TwinCalibrationParams,
  optimized: TwinCalibrationParams,
): OfflineFitChange[] {
  const changes: OfflineFitChange[] = [];
  for (const param of Object.keys(PARAM_LABELS) as (keyof TwinCalibrationParams)[]) {
    const currentValue = current[param];
    const optimizedValue = optimized[param];
    if (Math.abs(optimizedValue - currentValue) < 1e-12) continue;
    changes.push({
      param,
      label: PARAM_LABELS[param],
      currentValue,
      optimizedValue,
    });
  }
  return changes;
}

export async function fitOfflineReplayOptimization(
  samples: TuningSample[],
  current: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): Promise<OfflineFitResult | null> {
  if (samples.length < MIN_OFFLINE_FIT_SAMPLES) return null;
  if (!samples.some((s) => s.realMotorCm != null)) return null;

  const baselineScore = await replayCalibrationLoss(samples, current, weights);
  const fit = await fitTwinCalibrationParams(samples, current, weights);
  if (!fit) return null;

  const summary = await summarizeReplayError(samples, fit.params, weights);

  return {
    current,
    optimized: fit.params,
    changes: buildChanges(current, fit.params),
    diagnostics: {
      sampleCount: samples.length,
      baselineScore,
      optimizedScore: fit.score,
      scoreImprovement: baselineScore - fit.score,
      meanAbsPositionCm: summary.meanAbsPositionCm,
      meanAbsEncoder: summary.meanAbsEncoder,
    },
  };
}
