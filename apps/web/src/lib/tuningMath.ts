import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";

export type TuningSample = {
  t: number;
  realMotorCounts: number | null;
  simMotorCounts: number | null;
  realEncoderTicks: number;
  simEncoderTicks: number;
  realCommandedRpm: number;
  simCommandedRpm: number;
  realLimitLeft: boolean;
  realLimitRight: boolean;
  simLimitLeft: boolean;
  simLimitRight: boolean;
};

export type TuningErrorWeights = {
  position: number;
  encoder: number;
  rpm: number;
  limits: number;
};

export const DEFAULT_TUNING_WEIGHTS: TuningErrorWeights = {
  position: 1,
  encoder: 0.5,
  rpm: 0.25,
  limits: 2,
};

type ComparePayload = {
  real: {
    motor: { connected: boolean; commandedRpm: number; measuredPosition?: number };
    sensor: {
      encoderTicks: number;
      limitLeftPressed: boolean;
      limitRightPressed: boolean;
    };
  };
  sim: {
    motor: { connected: boolean; commandedRpm: number; measuredPosition?: number };
    sensor: {
      encoderTicks: number;
      limitLeftPressed: boolean;
      limitRightPressed: boolean;
    };
  };
};

export function sampleFromCompare(data: ComparePayload, t = Date.now()): TuningSample {
  const realPos = motorCountsForDisplay(data.real.motor.measuredPosition);
  const simPos = motorCountsForDisplay(data.sim.motor.measuredPosition);
  return {
    t,
    realMotorCounts:
      data.real.motor.connected && realPos !== undefined && Number.isFinite(realPos) ? realPos : null,
    simMotorCounts:
      data.sim.motor.connected && simPos !== undefined && Number.isFinite(simPos) ? simPos : null,
    realEncoderTicks: data.real.sensor.encoderTicks,
    simEncoderTicks: data.sim.sensor.encoderTicks,
    realCommandedRpm: data.real.motor.commandedRpm,
    simCommandedRpm: data.sim.motor.commandedRpm,
    realLimitLeft: data.real.sensor.limitLeftPressed,
    realLimitRight: data.real.sensor.limitRightPressed,
    simLimitLeft: data.sim.sensor.limitLeftPressed,
    simLimitRight: data.sim.sensor.limitRightPressed,
  };
}

function meanAbs(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + Math.abs(b), 0) / values.length;
}

export type TuningErrorSummary = {
  sampleCount: number;
  score: number;
  meanAbsPosition: number | null;
  meanAbsEncoder: number;
  meanAbsRpm: number;
  limitMismatchRate: number;
};

export function summarizeTuningError(
  samples: TuningSample[],
  weights: TuningErrorWeights = DEFAULT_TUNING_WEIGHTS,
): TuningErrorSummary {
  const posDeltas: number[] = [];
  const encDeltas: number[] = [];
  const rpmDeltas: number[] = [];
  let limitMismatches = 0;

  for (const s of samples) {
    if (s.realMotorCounts != null && s.simMotorCounts != null) {
      posDeltas.push(s.realMotorCounts - s.simMotorCounts);
    }
    encDeltas.push(s.realEncoderTicks - s.simEncoderTicks);
    rpmDeltas.push(s.realCommandedRpm - s.simCommandedRpm);
    if (s.realLimitLeft !== s.simLimitLeft || s.realLimitRight !== s.simLimitRight) {
      limitMismatches += 1;
    }
  }

  const meanAbsPosition = posDeltas.length > 0 ? meanAbs(posDeltas) : null;
  const meanAbsEncoder = meanAbs(encDeltas);
  const meanAbsRpm = meanAbs(rpmDeltas);
  const limitMismatchRate = samples.length > 0 ? limitMismatches / samples.length : 0;

  const score =
    (meanAbsPosition ?? 0) * weights.position +
    meanAbsEncoder * weights.encoder +
    meanAbsRpm * weights.rpm +
    limitMismatchRate * weights.limits;

  return {
    sampleCount: samples.length,
    score,
    meanAbsPosition,
    meanAbsEncoder,
    meanAbsRpm,
    limitMismatchRate,
  };
}

export function samplesToCsv(samples: TuningSample[]): string {
  const header = [
    "timestamp_iso",
    "real_motor_counts",
    "sim_motor_counts",
    "real_encoder_ticks",
    "sim_encoder_ticks",
    "real_commanded_rpm",
    "sim_commanded_rpm",
    "real_limit_left",
    "real_limit_right",
    "sim_limit_left",
    "sim_limit_right",
  ].join(",");
  const rows = samples.map((s) =>
    [
      new Date(s.t).toISOString(),
      s.realMotorCounts ?? "",
      s.simMotorCounts ?? "",
      s.realEncoderTicks,
      s.simEncoderTicks,
      s.realCommandedRpm,
      s.simCommandedRpm,
      s.realLimitLeft ? 1 : 0,
      s.realLimitRight ? 1 : 0,
      s.simLimitLeft ? 1 : 0,
      s.simLimitRight ? 1 : 0,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export type SimConfigForm = {
  metersPerDisplayCount: number;
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  gravity: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
  encoderTicksPerRadian: number;
};

export function configToForm(c: {
  metersPerDisplayCount: number;
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  plant: {
    gravity: number;
    pendulumLengthM: number;
    cartVelocityTrackingPerSec: number;
    angularDampingPerSec: number;
    encoderTicksPerRadian: number;
  };
}): SimConfigForm {
  return {
    metersPerDisplayCount: c.metersPerDisplayCount,
    mpsPerRpm: c.mpsPerRpm,
    limitLeftXM: c.limitLeftXM,
    limitRightXM: c.limitRightXM,
    gravity: c.plant.gravity,
    pendulumLengthM: c.plant.pendulumLengthM,
    cartVelocityTrackingPerSec: c.plant.cartVelocityTrackingPerSec,
    angularDampingPerSec: c.plant.angularDampingPerSec,
    encoderTicksPerRadian: c.plant.encoderTicksPerRadian,
  };
}

export function formToPatch(form: SimConfigForm) {
  return {
    metersPerDisplayCount: form.metersPerDisplayCount,
    mpsPerRpm: form.mpsPerRpm,
    limitLeftXM: form.limitLeftXM,
    limitRightXM: form.limitRightXM,
    plant: {
      gravity: form.gravity,
      pendulumLengthM: form.pendulumLengthM,
      cartVelocityTrackingPerSec: form.cartVelocityTrackingPerSec,
      angularDampingPerSec: form.angularDampingPerSec,
      encoderTicksPerRadian: form.encoderTicksPerRadian,
    },
  };
}

export function formToEnvSnippet(form: SimConfigForm): string {
  return [
    `# Coupled sim tuning (restart serve:coupled-sim after editing .env)`,
    `SIM_METERS_PER_DISPLAY_COUNT=${form.metersPerDisplayCount}`,
    `SIM_MPS_PER_RPM=${form.mpsPerRpm}`,
    `SIM_LIMIT_LEFT_X_M=${form.limitLeftXM}`,
    `SIM_LIMIT_RIGHT_X_M=${form.limitRightXM}`,
    `# Plant params are applied live via tuning UI PATCH; for cold start, extend serveCoupledSim env if needed.`,
  ].join("\n");
}
