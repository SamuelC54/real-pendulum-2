import { physicsSimReplay } from "@real-pendulum/cart-pendulum-sim";
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

const replayDefaults = () => ({
  gravity: plantGravityMS2(),
  encoderTicksPerRadian: encoderTicksPerRadian(),
  limitLeftXM: simLimitLeftXM(),
  limitRightXM: simLimitRightXM(),
});

export async function replayTwinTrace(
  samples: TuningSample[],
  params: TwinCalibrationParams,
): Promise<{ motorCm: number; encoderTicks: number }[]> {
  return physicsSimReplay({
    samples,
    params,
    defaults: replayDefaults(),
  });
}

export async function summarizeReplayError(
  samples: TuningSample[],
  params: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): Promise<{ score: number; meanAbsPositionCm: number | null; meanAbsEncoder: number }> {
  const trace = await replayTwinTrace(samples, params);
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

export async function replayCalibrationLoss(
  samples: TuningSample[],
  params: TwinCalibrationParams,
  weights: TwinCalibrationWeights,
): Promise<number> {
  return (await summarizeReplayError(samples, params, weights)).score;
}
