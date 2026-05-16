import {
  createCartPendulumPlant,
  encoderTicksInt,
  stepCartPendulum,
  type CartPendulumPlant,
} from "@real-pendulum/cart-pendulum-sim";
import { encoderTicksPerRadian, plantGravityMS2 } from "@/lib/pendulumEncoder";
import { simLimitLeftXM, simLimitRightXM } from "@/lib/simLimits";
import {
  DEFAULT_TUNING_WEIGHTS,
  summarizeTuningError,
  type SimConfigForm,
  type TuningErrorWeights,
  type TuningSample,
} from "@/lib/tuningMath";

export type ReplayPoint = {
  motorCm: number;
  encoderTicks: number;
  limitLeft: boolean;
  limitRight: boolean;
};

/** Display rail cm ↔ plant cart position (m); matches coupled sim / control-api. */
export function motorCmToXM(cm: number): number {
  return cm / 100;
}

export function motorXmToCm(xM: number): number {
  return xM * 100;
}

function createPlantForForm(form: SimConfigForm): CartPendulumPlant {
  return createCartPendulumPlant({
    gravity: plantGravityMS2(),
    pendulumLengthM: form.pendulumLengthM,
    cartVelocityTrackingPerSec: form.cartVelocityTrackingPerSec,
    angularDampingPerSec: form.angularDampingPerSec,
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
  plant.state.vCmdMps = -s0.commandedRpm * 0; // set on first step

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

/**
 * Re-simulate the recorded session with candidate coupled-sim parameters and hardware jog commands.
 * Initial cart pose and encoder state are taken from the first sample with real position data.
 */
export function replayTwinTrace(samples: TuningSample[], form: SimConfigForm): ReplayPoint[] {
  if (samples.length === 0) return [];

  const startIdx = samples.findIndex((s) => s.realMotorCm != null);
  if (startIdx < 0) {
    return samples.map(() => ({
      motorCm: 0,
      encoderTicks: 0,
      limitLeft: false,
      limitRight: false,
    }));
  }

  const plant = createPlantForForm(form);
  initPlantFromFirstSample(plant, samples, startIdx);

  const out: ReplayPoint[] = [];

  for (let i = 0; i < samples.length; i++) {
    if (i > 0) {
      const prev = samples[i - 1]!;
      const cur = samples[i]!;
      const dt = (cur.t - prev.t) / 1000;
      if (dt > 0) {
        plant.state.vCmdMps = -cur.commandedRpm * form.mpsPerRpm;
        enforceTravelLimitOnCommand(plant);
        stepCartPendulum(plant, dt);
        enforceTravelLimitOnCommand(plant);
      }
    } else if (i < startIdx) {
      out.push({
        motorCm: 0,
        encoderTicks: samples[0]?.realEncoderTicks ?? 0,
        limitLeft: false,
        limitRight: false,
      });
      continue;
    }

    const x = plant.state.xM;
    out.push({
      motorCm: motorXmToCm(x),
      encoderTicks: encoderTicksInt(plant),
      limitLeft: x <= simLimitLeftXM(),
      limitRight: x >= simLimitRightXM(),
    });
  }

  return out;
}

/** Build tuning samples as if replay outputs were live sim readings (real = hardware). */
export function samplesWithReplayAsSim(
  samples: TuningSample[],
  form: SimConfigForm,
): TuningSample[] {
  const trace = replayTwinTrace(samples, form);
  return samples.map((s, i) => ({
    ...s,
    simMotorCm: trace[i]?.motorCm ?? null,
    simEncoderTicks: trace[i]?.encoderTicks ?? s.simEncoderTicks,
    simLimitLeft: trace[i]?.limitLeft ?? s.simLimitLeft,
    simLimitRight: trace[i]?.limitRight ?? s.simLimitRight,
  }));
}

/** Weighted real-vs-sim error when sim trajectories are produced by replaying samples. */
export function replayTuningLoss(
  samples: TuningSample[],
  form: SimConfigForm,
  weights: TuningErrorWeights = DEFAULT_TUNING_WEIGHTS,
): number {
  return summarizeTuningError(samplesWithReplayAsSim(samples, form), weights).score;
}
