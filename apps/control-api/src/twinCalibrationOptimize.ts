import { physicsSimCalibrate } from "@real-pendulum/physics-sim/client";
import { encoderTicksPerRadian, plantGravityMS2 } from "./pendulumEncoder.js";
import { simLimitLeftXM, simLimitRightXM } from "./simLimits.js";
import type { TuningSample } from "./tuningSample.js";
import type { TwinCalibrationParams, TwinCalibrationWeights } from "./twinCalibrationTypes.js";

export const MIN_CALIBRATION_SAMPLES = 12;

const replayDefaults = () => ({
  gravity: plantGravityMS2(),
  encoderTicksPerRadian: encoderTicksPerRadian(),
  limitLeftXM: simLimitLeftXM(),
  limitRightXM: simLimitRightXM(),
});

/**
 * Fit sim parameters on a telemetry window using MuJoCo replay loss (SciPy in physics-sim).
 * Robot commands are fixed; only the digital twin parameters change.
 */
export async function fitTwinCalibrationParams(
  samples: TuningSample[],
  start: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): Promise<{ params: TwinCalibrationParams; score: number } | null> {
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null;
  if (!samples.some((s) => s.realMotorCm != null)) return null;

  const fit = await physicsSimCalibrate({
    samples,
    start,
    weights,
    defaults: replayDefaults(),
  });
  if (!fit) return null;

  return {
    params: fit.params as TwinCalibrationParams,
    score: fit.score,
  };
}

export function blendParams(
  current: TwinCalibrationParams,
  target: TwinCalibrationParams,
  alpha: number,
): TwinCalibrationParams {
  const a = Math.max(0, Math.min(1, alpha));
  const logMps =
    (1 - a) * Math.log10(current.mpsPerRpm) + a * Math.log10(target.mpsPerRpm);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    mpsPerRpm: clamp(10 ** logMps, 1e-9, 0.02),
    pendulumLengthM: clamp(
      (1 - a) * current.pendulumLengthM + a * target.pendulumLengthM,
      0.08,
      1.5,
    ),
    cartVelocityTrackingPerSec: clamp(
      (1 - a) * current.cartVelocityTrackingPerSec + a * target.cartVelocityTrackingPerSec,
      1,
      60,
    ),
    angularDampingPerSec: clamp(
      (1 - a) * current.angularDampingPerSec + a * target.angularDampingPerSec,
      0,
      3,
    ),
  };
}
