import { replayCalibrationLoss, replayTwinTrace } from "./tuningReplay.js";
import type { TuningSample } from "./tuningSample.js";
import {
  DEFAULT_CALIBRATION_WEIGHTS,
  type TwinCalibrationParams,
  type TwinCalibrationWeights,
} from "./twinCalibrationTypes.js";

export const MIN_CALIBRATION_SAMPLES = 12;
const MAX_SAMPLES_FOR_FIT = 96;

const BOUNDS = {
  mpsPerRpm: { min: 1e-9, max: 0.02 },
  pendulumLengthM: { min: 0.08, max: 1.5 },
  cartVelocityTrackingPerSec: { min: 1, max: 60 },
  angularDampingPerSec: { min: 0, max: 3 },
} as const;

function clamp(params: TwinCalibrationParams): TwinCalibrationParams {
  return {
    mpsPerRpm: Math.max(BOUNDS.mpsPerRpm.min, Math.min(BOUNDS.mpsPerRpm.max, params.mpsPerRpm)),
    pendulumLengthM: Math.max(BOUNDS.pendulumLengthM.min, Math.min(BOUNDS.pendulumLengthM.max, params.pendulumLengthM)),
    cartVelocityTrackingPerSec: Math.max(
      BOUNDS.cartVelocityTrackingPerSec.min,
      Math.min(BOUNDS.cartVelocityTrackingPerSec.max, params.cartVelocityTrackingPerSec),
    ),
    angularDampingPerSec: Math.max(
      BOUNDS.angularDampingPerSec.min,
      Math.min(BOUNDS.angularDampingPerSec.max, params.angularDampingPerSec),
    ),
  };
}

function subsample(samples: TuningSample[], max: number): TuningSample[] {
  if (samples.length <= max) return samples;
  const out: TuningSample[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (samples.length - 1)) / (max - 1));
    out.push(samples[idx]!);
  }
  return out;
}

/** Scale mpsPerRpm so replayed cart travel matches recorded travel. */
export async function estimateMpsPerRpmFromTravel(
  samples: TuningSample[],
  params: TwinCalibrationParams,
): Promise<number> {
  const trace = await replayTwinTrace(samples, params);
  let realTravel = 0;
  let simTravel = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const tr = trace[i - 1];
    const tb = trace[i];
    if (a.realMotorCm != null && b.realMotorCm != null) {
      realTravel += Math.abs(b.realMotorCm - a.realMotorCm);
    }
    if (tr && tb) {
      simTravel += Math.abs(tb.motorCm - tr.motorCm);
    }
  }
  if (simTravel < 1e-9 || realTravel < 1e-9) return params.mpsPerRpm;
  return clamp({ ...params, mpsPerRpm: params.mpsPerRpm * (realTravel / simTravel) }).mpsPerRpm;
}

/**
 * Fit sim parameters on a telemetry window using MuJoCo replay loss.
 * Robot commands are fixed; only the digital twin parameters change.
 */
export async function fitTwinCalibrationParams(
  samples: TuningSample[],
  start: TwinCalibrationParams,
  weights: TwinCalibrationWeights = DEFAULT_CALIBRATION_WEIGHTS,
): Promise<{ params: TwinCalibrationParams; score: number } | null> {
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null;
  if (!samples.some((s) => s.realMotorCm != null)) return null;

  const window = subsample(samples, MAX_SAMPLES_FOR_FIT);
  let current = clamp(start);
  current = { ...current, mpsPerRpm: await estimateMpsPerRpmFromTravel(window, current) };
  let score = await replayCalibrationLoss(window, current, weights);

  const scales = [0.82, 0.91, 1, 1.09, 1.18];
  for (let pass = 0; pass < 6; pass++) {
    for (const key of [
      "mpsPerRpm",
      "cartVelocityTrackingPerSec",
      "pendulumLengthM",
      "angularDampingPerSec",
    ] as const) {
      for (const scale of scales) {
        const trial = clamp({ ...current, [key]: current[key] * scale });
        const trialScore = await replayCalibrationLoss(window, trial, weights);
        if (trialScore < score) {
          score = trialScore;
          current = trial;
        }
      }
    }
  }

  return { params: current, score };
}

export function blendParams(
  current: TwinCalibrationParams,
  target: TwinCalibrationParams,
  alpha: number,
): TwinCalibrationParams {
  const a = Math.max(0, Math.min(1, alpha));
  const logMps =
    (1 - a) * Math.log10(current.mpsPerRpm) + a * Math.log10(target.mpsPerRpm);
  return clamp({
    mpsPerRpm: 10 ** logMps,
    cartVelocityTrackingPerSec:
      (1 - a) * current.cartVelocityTrackingPerSec + a * target.cartVelocityTrackingPerSec,
    pendulumLengthM: (1 - a) * current.pendulumLengthM + a * target.pendulumLengthM,
    angularDampingPerSec:
      (1 - a) * current.angularDampingPerSec + a * target.angularDampingPerSec,
  });
}
