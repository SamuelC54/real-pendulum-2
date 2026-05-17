import type {
  CoupledSimParameters,
  CoupledSimParametersPatch,
} from "@real-pendulum/app-config/coupled-sim-parameters";

/** Tunable coupled-sim fields (sim only — hardware is never modified). */
export type TwinCalibrationParams = {
  mpsPerRpm: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
};

export type TwinCalibrationWeights = {
  position: number;
  encoder: number;
};

export const DEFAULT_CALIBRATION_WEIGHTS: TwinCalibrationWeights = {
  position: 1,
  encoder: 0.5,
};

export function paramsFromCoupledSim(c: CoupledSimParameters): TwinCalibrationParams {
  return {
    mpsPerRpm: c.mpsPerRpm,
    pendulumLengthM: c.pendulumLengthM,
    cartVelocityTrackingPerSec: c.cartVelocityTrackingPerSec,
    angularDampingPerSec: c.angularDampingPerSec,
  };
}

export function coupledSimPatchFromParams(p: TwinCalibrationParams): CoupledSimParametersPatch {
  return { ...p };
}

export type TwinCalibrationMetrics = {
  score: number;
  meanAbsPositionCm: number | null;
  meanAbsEncoder: number;
  /** Instantaneous live twin compare (no replay). */
  livePositionDeltaCm: number | null;
  liveEncoderDelta: number;
};

export type LiveTwinCalibrationStatus = {
  active: boolean;
  windowSampleCount: number;
  updateCount: number;
  lastSampleAt: number | null;
  lastOptimizeAt: number | null;
  lastOptimizeError: string | null;
  metrics: TwinCalibrationMetrics;
  parameters: TwinCalibrationParams;
  baselineParameters: TwinCalibrationParams;
  persistToFileOnStop: boolean;
};
