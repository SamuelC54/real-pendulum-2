import {
  createCartPendulumPlant,
  encoderTicksInt,
  stepCartPendulum,
  type CartPendulumPlant,
} from "@real-pendulum/cart-pendulum-sim";
import { encoderTicksPerRadian, plantGravityMS2 } from "./pendulumEncoder.js";
import { simLimitLeftXM, simLimitRightXM } from "./simLimits.js";
import type { TuningSample } from "./tuningSample.js";
import type { TwinCalibrationParams, TwinCalibrationWeights } from "./twinCalibrationTypes.js";

export function motorCmToXM(cm: number): number {
  return cm / 100;
}

export function motorXmToCm(xM: number): number {
  return xM * 100;
}

function createPlantForParams(params: TwinCalibrationParams): CartPendulumPlant {
  return createCartPendulumPlant({
    gravity: plantGravityMS2(),
    pendulumLengthM: params.pendulumLengthM,
    cartVelocityTrackingPerSec: params.cartVelocityTrackingPerSec,
    angularDampingPerSec: params.angularDampingPerSec,
    encoderTicksPerRadian: encoderTicksPerRadian(),
  });
}

function enforceTravelLimitOnCommand(plant: CartPendulumPlant): void {
  const x = plant.state.xM;
  if (x <= simLimitLeftXM() && plant.state.vCmdMps < 0) {
    plant.state.vCmdMps = 0;
  }
  if (x >= simLimitRightXM() && plant.state.vCmdMps > 0) {
    plant.state.vCmdMps = 0;
  }
}

function initPlantFromFirstSample(
  plant: CartPendulumPlant,
  samples: TuningSample[],
  startIdx: number,
): void {
  const s0 = samples[startIdx]!;
  plant.state.xM = s0.realMotorCm != null ? motorCmToXM(s0.realMotorCm) : 0;
  plant.state.encoderTicksFloat = s0.realEncoderTicks;
  plant.state.thetaRad = s0.realEncoderTicks / encoderTicksPerRadian();
  plant.state.omegaRps = 0;
  plant.state.vMps = 0;
  plant.state.vCmdMps = 0;

  const s1 = samples[startIdx + 1];
  if (!s1) return;
  const dt = (s1.t - s0.t) / 1000;
  if (!(dt > 1e-6)) return;

  const tpr = encoderTicksPerRadian();
  plant.state.omegaRps = (s1.realEncoderTicks - s0.realEncoderTicks) / dt / tpr;
  if (s1.realMotorCm != null && s0.realMotorCm != null) {
    plant.state.vMps = motorCmToXM(s1.realMotorCm - s0.realMotorCm) / dt;
  }
}

export function replayTwinTrace(samples: TuningSample[], params: TwinCalibrationParams) {
  if (samples.length === 0) return [];

  const startIdx = samples.findIndex((s) => s.realMotorCm != null);
  if (startIdx < 0) {
    return samples.map(() => ({ motorCm: 0, encoderTicks: 0 }));
  }

  const plant = createPlantForParams(params);
  initPlantFromFirstSample(plant, samples, startIdx);

  const out: { motorCm: number; encoderTicks: number }[] = [];

  for (let i = 0; i < samples.length; i++) {
    if (i > 0) {
      const prev = samples[i - 1]!;
      const cur = samples[i]!;
      const dt = (cur.t - prev.t) / 1000;
      if (dt > 0) {
        plant.state.vCmdMps = -cur.commandedRpm * params.mpsPerRpm;
        enforceTravelLimitOnCommand(plant);
        stepCartPendulum(plant, dt);
        enforceTravelLimitOnCommand(plant);
      }
    } else if (i < startIdx) {
      out.push({ motorCm: 0, encoderTicks: samples[0]?.realEncoderTicks ?? 0 });
      continue;
    }

    out.push({
      motorCm: motorXmToCm(plant.state.xM),
      encoderTicks: encoderTicksInt(plant),
    });
  }

  return out;
}

export function summarizeReplayError(
  samples: TuningSample[],
  params: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): { score: number; meanAbsPositionCm: number | null; meanAbsEncoder: number } {
  const trace = replayTwinTrace(samples, params);
  const posDeltas: number[] = [];
  const encDeltas: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const r = trace[i];
    if (!r) continue;
    if (s.realMotorCm != null) {
      posDeltas.push(s.realMotorCm - r.motorCm);
    }
    encDeltas.push(s.realEncoderTicks - r.encoderTicks);
  }

  const meanAbs = (vals: number[]) =>
    vals.length > 0 ? vals.reduce((a, b) => a + Math.abs(b), 0) / vals.length : 0;

  const meanAbsPositionCm = posDeltas.length > 0 ? meanAbs(posDeltas) : null;
  const meanAbsEncoder = meanAbs(encDeltas);
  const score = (meanAbsPositionCm ?? 0) * weights.position + meanAbsEncoder * weights.encoder;

  return { score, meanAbsPositionCm, meanAbsEncoder };
}

export function replayCalibrationLoss(
  samples: TuningSample[],
  params: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): number {
  return summarizeReplayError(samples, params, weights).score;
}
