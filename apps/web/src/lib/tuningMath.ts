export type TuningSample = {
  t: number;
  /** Jog command shared by hardware and sim (logged only, not compared). */
  commandedRpm: number;
  realMotorCm: number | null;
  simMotorCm: number | null;
  realEncoderTicks: number;
  simEncoderTicks: number;
  realLimitLeft: boolean;
  realLimitRight: boolean;
  simLimitLeft: boolean;
  simLimitRight: boolean;
};

export type TuningErrorWeights = {
  position: number;
  encoder: number;
};

export const DEFAULT_TUNING_WEIGHTS: TuningErrorWeights = {
  position: 1,
  encoder: 0.5,
};

function sharedCommandedRpm(data: ComparePayload): number {
  const rpm = data.real.motor.commandedRpm ?? data.sim.motor.commandedRpm;
  return rpm !== undefined && Number.isFinite(rpm) ? rpm : 0;
}

type ComparePayload = {
  real: {
    motor: { connected: boolean; positionCm?: number; commandedRpm?: number };
    sensor: {
      encoderTicks: number;
      limitLeftPressed: boolean;
      limitRightPressed: boolean;
    };
  };
  sim: {
    motor: { connected: boolean; positionCm?: number; commandedRpm?: number };
    sensor: {
      encoderTicks: number;
      limitLeftPressed: boolean;
      limitRightPressed: boolean;
    };
  };
};

export function sampleFromCompare(data: ComparePayload, t = Date.now()): TuningSample {
  const realPos = data.real.motor.positionCm;
  const simPos = data.sim.motor.positionCm;
  return {
    t,
    commandedRpm: sharedCommandedRpm(data),
    realMotorCm:
      data.real.motor.connected && realPos !== undefined && Number.isFinite(realPos) ? realPos : null,
    simMotorCm:
      data.sim.motor.connected && simPos !== undefined && Number.isFinite(simPos) ? simPos : null,
    realEncoderTicks: data.real.sensor.encoderTicks,
    simEncoderTicks: data.sim.sensor.encoderTicks,
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
  meanAbsPositionCm: number | null;
  meanAbsEncoder: number;
  limitMismatchRate: number;
};

export function summarizeTuningError(
  samples: TuningSample[],
  weights: TuningErrorWeights = DEFAULT_TUNING_WEIGHTS,
): TuningErrorSummary {
  const posDeltas: number[] = [];
  const encDeltas: number[] = [];
  let limitMismatches = 0;

  for (const s of samples) {
    if (s.realMotorCm != null && s.simMotorCm != null) {
      posDeltas.push(s.realMotorCm - s.simMotorCm);
    }
    encDeltas.push(s.realEncoderTicks - s.simEncoderTicks);
    if (s.realLimitLeft !== s.simLimitLeft || s.realLimitRight !== s.simLimitRight) {
      limitMismatches += 1;
    }
  }

  const meanAbsPositionCm = posDeltas.length > 0 ? meanAbs(posDeltas) : null;
  const meanAbsEncoder = meanAbs(encDeltas);
  const limitMismatchRate = samples.length > 0 ? limitMismatches / samples.length : 0;

  const score =
    (meanAbsPositionCm ?? 0) * weights.position + meanAbsEncoder * weights.encoder;

  return {
    sampleCount: samples.length,
    score,
    meanAbsPositionCm,
    meanAbsEncoder,
    limitMismatchRate,
  };
}

export function samplesToCsv(samples: TuningSample[]): string {
  const header = [
    "timestamp_iso",
    "commanded_rpm",
    "real_motor_cm",
    "sim_motor_cm",
    "real_encoder_ticks",
    "sim_encoder_ticks",
    "real_limit_left",
    "real_limit_right",
    "sim_limit_left",
    "sim_limit_right",
  ].join(",");
  const rows = samples.map((s) =>
    [
      new Date(s.t).toISOString(),
      s.commandedRpm,
      s.realMotorCm ?? "",
      s.simMotorCm ?? "",
      s.realEncoderTicks,
      s.simEncoderTicks,
      s.realLimitLeft ? 1 : 0,
      s.realLimitRight ? 1 : 0,
      s.simLimitLeft ? 1 : 0,
      s.simLimitRight ? 1 : 0,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export type SimConfigForm = {
  mpsPerRpm: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
};

export function configToForm(c: {
  mpsPerRpm: number;
  plant: {
    pendulumLengthM: number;
    cartVelocityTrackingPerSec: number;
    angularDampingPerSec: number;
  };
}): SimConfigForm {
  return {
    mpsPerRpm: c.mpsPerRpm,
    pendulumLengthM: c.plant.pendulumLengthM,
    cartVelocityTrackingPerSec: c.plant.cartVelocityTrackingPerSec,
    angularDampingPerSec: c.plant.angularDampingPerSec,
  };
}

export function formToPatch(form: SimConfigForm) {
  return {
    mpsPerRpm: form.mpsPerRpm,
    plant: {
      pendulumLengthM: form.pendulumLengthM,
      cartVelocityTrackingPerSec: form.cartVelocityTrackingPerSec,
      angularDampingPerSec: form.angularDampingPerSec,
    },
  };
}

export function formToConfigSnippet(form: SimConfigForm, jsonPath = "config/coupled-sim.parameters.json"): string {
  return JSON.stringify(
    {
      mpsPerRpm: form.mpsPerRpm,
      plant: {
        pendulumLengthM: form.pendulumLengthM,
        cartVelocityTrackingPerSec: form.cartVelocityTrackingPerSec,
        angularDampingPerSec: form.angularDampingPerSec,
      },
    },
    null,
    2,
  ).concat(`\n// Save as ${jsonPath} or use tuning.simConfig.patch / put via control-api.\n`);
}
