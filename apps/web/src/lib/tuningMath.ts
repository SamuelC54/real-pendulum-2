export type TuningSample = {
  t: number;
  /** Jog command shared by hardware and sim (logged only, not compared). */
  commandedRpm: number;
  realMotorCm: number | null;
  simMotorCm: number | null;
  realEncoderTicks: number;
  simEncoderTicks: number;
};

export type TuningErrorWeights = {
  position: number;
  encoder: number;
};

export const DEFAULT_TUNING_WEIGHTS: TuningErrorWeights = {
  position: 1,
  encoder: 0.5,
};

function meanAbs(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + Math.abs(b), 0) / values.length;
}

export type TuningErrorSummary = {
  sampleCount: number;
  score: number;
  meanAbsPositionCm: number | null;
  meanAbsEncoder: number;
};

export function summarizeTuningError(
  samples: TuningSample[],
  weights: TuningErrorWeights = DEFAULT_TUNING_WEIGHTS,
): TuningErrorSummary {
  const posDeltas: number[] = [];
  const encDeltas: number[] = [];

  for (const s of samples) {
    if (s.realMotorCm != null && s.simMotorCm != null) {
      posDeltas.push(s.realMotorCm - s.simMotorCm);
    }
    encDeltas.push(s.realEncoderTicks - s.simEncoderTicks);
  }

  const meanAbsPositionCm = posDeltas.length > 0 ? meanAbs(posDeltas) : null;
  const meanAbsEncoder = meanAbs(encDeltas);

  const score =
    (meanAbsPositionCm ?? 0) * weights.position + meanAbsEncoder * weights.encoder;

  return {
    sampleCount: samples.length,
    score,
    meanAbsPositionCm,
    meanAbsEncoder,
  };
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

export function formToTwinParams(form: SimConfigForm) {
  return {
    mpsPerRpm: form.mpsPerRpm,
    pendulumLengthM: form.pendulumLengthM,
    cartVelocityTrackingPerSec: form.cartVelocityTrackingPerSec,
    angularDampingPerSec: form.angularDampingPerSec,
  };
}

export function twinParamsToForm(p: ReturnType<typeof formToTwinParams>): SimConfigForm {
  return { ...p };
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
