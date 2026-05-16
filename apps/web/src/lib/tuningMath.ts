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
  limits: number;
};

export const DEFAULT_TUNING_WEIGHTS: TuningErrorWeights = {
  position: 1,
  encoder: 0.5,
  limits: 2,
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
    (meanAbsPositionCm ?? 0) * weights.position +
    meanAbsEncoder * weights.encoder +
    limitMismatchRate * weights.limits;

  return {
    sampleCount: samples.length,
    score,
    meanAbsPositionCm,
    meanAbsEncoder,
    limitMismatchRate,
  };
}

export type TuningSuggestionConfidence = "low" | "medium" | "high";

export type TuningParamKey = keyof SimConfigForm;

export type TuningSuggestion = {
  param: TuningParamKey;
  label: string;
  direction: "increase" | "decrease";
  currentValue: number;
  suggestedValue: number;
  confidence: TuningSuggestionConfidence;
  reason: string;
};

export type TuningSuggestionDiagnostics = {
  sampleCount: number;
  pairedPositionCount: number;
  meanPositionDeltaCm: number | null;
  positionDeltaStdCm: number | null;
  meanEncoderDelta: number | null;
  encoderDeltaStd: number | null;
  meanPositionDeltaWhileMovingCm: number | null;
  limitMismatchRate: number;
  simLeftLimitEarlyCount: number;
  simRightLimitEarlyCount: number;
};

export type TuningSuggestionResult = {
  suggestions: TuningSuggestion[];
  diagnostics: TuningSuggestionDiagnostics;
};

const MIN_SAMPLES = 8;
const JOG_RPM_THRESHOLD = 8;
const MAX_RELATIVE_ADJUST = 0.12;
const MIN_POSITION_BIAS_CM = 0.25;
const MIN_ENCODER_BIAS = 8;
const MIN_LIMIT_EARLY_EVENTS = 2;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function confidenceFromSignal(
  n: number,
  effect: number,
  threshold: number,
  std: number,
): TuningSuggestionConfidence {
  if (n < MIN_SAMPLES || effect < threshold) return "low";
  const stable = std < Math.max(threshold * 0.75, effect * 0.6);
  if (n >= 30 && effect >= threshold * 2 && stable) return "high";
  if (n >= 15 && effect >= threshold * 1.25) return "medium";
  return "low";
}

function clampSuggested(current: number, raw: number): number {
  if (!Number.isFinite(current) || current === 0) return raw;
  const factor = raw / current;
  const clamped = Math.max(1 - MAX_RELATIVE_ADJUST, Math.min(1 + MAX_RELATIVE_ADJUST, factor));
  return current * clamped;
}

function pushSuggestion(
  out: TuningSuggestion[],
  suggestion: Omit<TuningSuggestion, "direction"> & { direction?: "increase" | "decrease" },
): void {
  const direction =
    suggestion.direction ??
    (suggestion.suggestedValue >= suggestion.currentValue ? "increase" : "decrease");
  if (Math.abs(suggestion.suggestedValue - suggestion.currentValue) < 1e-12) return;
  out.push({ ...suggestion, direction });
}

/** Heuristic sim-parameter hints from a recorded twin session (Phase A — not auto-applied). */
export function suggestSimTuning(
  samples: TuningSample[],
  current: SimConfigForm,
): TuningSuggestionResult {
  const suggestions: TuningSuggestion[] = [];

  const positionDeltas: number[] = [];
  const encoderDeltas: number[] = [];
  const movingPositionDeltas: number[] = [];
  let limitMismatches = 0;
  let simLeftEarly = 0;
  let simRightEarly = 0;

  for (const s of samples) {
    if (s.realMotorCm != null && s.simMotorCm != null) {
      const d = s.realMotorCm - s.simMotorCm;
      positionDeltas.push(d);
      if (Math.abs(s.commandedRpm) >= JOG_RPM_THRESHOLD) {
        movingPositionDeltas.push(d);
      }
    }
    encoderDeltas.push(s.realEncoderTicks - s.simEncoderTicks);
    if (s.realLimitLeft !== s.simLimitLeft || s.realLimitRight !== s.simLimitRight) {
      limitMismatches += 1;
    }
    if (s.simLimitLeft && !s.realLimitLeft) simLeftEarly += 1;
    if (s.simLimitRight && !s.realLimitRight) simRightEarly += 1;
  }

  const meanPos = positionDeltas.length > 0 ? mean(positionDeltas) : null;
  const stdPos = positionDeltas.length > 0 ? stdDev(positionDeltas) : null;
  const meanEnc = encoderDeltas.length > 0 ? mean(encoderDeltas) : null;
  const stdEnc = encoderDeltas.length > 0 ? stdDev(encoderDeltas) : null;
  const meanMovingPos = movingPositionDeltas.length > 0 ? mean(movingPositionDeltas) : null;
  const limitMismatchRate = samples.length > 0 ? limitMismatches / samples.length : 0;

  const diagnostics: TuningSuggestionDiagnostics = {
    sampleCount: samples.length,
    pairedPositionCount: positionDeltas.length,
    meanPositionDeltaCm: meanPos,
    positionDeltaStdCm: stdPos,
    meanEncoderDelta: meanEnc,
    encoderDeltaStd: stdEnc,
    meanPositionDeltaWhileMovingCm: meanMovingPos,
    limitMismatchRate,
    simLeftLimitEarlyCount: simLeftEarly,
    simRightLimitEarlyCount: simRightEarly,
  };

  if (samples.length < MIN_SAMPLES) {
    return { suggestions, diagnostics };
  }

  const meanSimCm =
    positionDeltas.length > 0
      ? mean(samples.filter((s) => s.simMotorCm != null).map((s) => s.simMotorCm as number))
      : null;

  if (meanPos != null && Math.abs(meanPos) >= MIN_POSITION_BIAS_CM && meanSimCm != null && meanSimCm !== 0) {
    const targetMeters = current.metersPerDisplayCount * (meanSimCm / (meanSimCm + meanPos));
    const suggested = clampSuggested(current.metersPerDisplayCount, targetMeters);
    pushSuggestion(suggestions, {
      param: "metersPerDisplayCount",
      label: "SIM_METERS_PER_DISPLAY_COUNT",
      currentValue: current.metersPerDisplayCount,
      suggestedValue: suggested,
      confidence: confidenceFromSignal(
        positionDeltas.length,
        Math.abs(meanPos),
        MIN_POSITION_BIAS_CM,
        stdPos ?? 0,
      ),
      reason:
        meanPos > 0
          ? `Hardware cart reads ~${fmtDelta(meanPos)} cm ahead of sim on average — lower this to raise sim position.`
          : `Sim cart reads ~${fmtDelta(-meanPos)} cm ahead of hardware on average — raise this to lower sim position.`,
    });
  }

  if (
    meanMovingPos != null &&
    movingPositionDeltas.length >= MIN_SAMPLES / 2 &&
    Math.abs(meanMovingPos) >= MIN_POSITION_BIAS_CM &&
    (meanPos == null || Math.abs(meanMovingPos) > Math.abs(meanPos) * 1.2)
  ) {
    const factor = meanMovingPos > 0 ? 1.05 : 0.95;
    pushSuggestion(suggestions, {
      param: "mpsPerRpm",
      label: "SIM_MPS_PER_RPM",
      currentValue: current.mpsPerRpm,
      suggestedValue: clampSuggested(current.mpsPerRpm, current.mpsPerRpm * factor),
      confidence: confidenceFromSignal(
        movingPositionDeltas.length,
        Math.abs(meanMovingPos),
        MIN_POSITION_BIAS_CM,
        stdDev(movingPositionDeltas),
      ),
      reason:
        meanMovingPos > 0
          ? "While jogging, sim cart lags hardware — increase sim speed per RPM."
          : "While jogging, sim cart leads hardware — decrease sim speed per RPM.",
    });
  }

  if (meanEnc != null && Math.abs(meanEnc) >= MIN_ENCODER_BIAS) {
    const encFactor = meanEnc > 0 ? 1.05 : 0.95;
    const posSmall = meanPos == null || Math.abs(meanPos) < MIN_POSITION_BIAS_CM;
    pushSuggestion(suggestions, {
      param: "encoderTicksPerRadian",
      label: "Encoder ticks / radian",
      currentValue: current.encoderTicksPerRadian,
      suggestedValue: clampSuggested(current.encoderTicksPerRadian, current.encoderTicksPerRadian * encFactor),
      confidence: confidenceFromSignal(
        encoderDeltas.length,
        Math.abs(meanEnc),
        MIN_ENCODER_BIAS,
        stdEnc ?? 0,
      ),
      reason:
        meanEnc > 0
          ? `Encoder on hardware leads sim by ~${Math.round(Math.abs(meanEnc))} ticks on average${posSmall ? " (cart position looks aligned)" : ""}.`
          : `Sim encoder leads hardware by ~${Math.round(Math.abs(meanEnc))} ticks on average${posSmall ? " (cart position looks aligned)" : ""}.`,
    });

    if (posSmall && Math.abs(meanEnc) >= MIN_ENCODER_BIAS * 2) {
      pushSuggestion(suggestions, {
        param: "angularDampingPerSec",
        label: "Angular damping (1/s)",
        currentValue: current.angularDampingPerSec,
        suggestedValue: clampSuggested(
          current.angularDampingPerSec,
          meanEnc > 0 ? current.angularDampingPerSec * 1.08 : current.angularDampingPerSec * 0.92,
        ),
        confidence: "low",
        reason:
          "Large encoder mismatch with small cart error — pendulum dynamics may need damping or length tuning; try encoder scale first.",
      });
    }
  }

  const hasMpsSuggestion = suggestions.some((s) => s.param === "mpsPerRpm");
  if (
    !hasMpsSuggestion &&
    meanMovingPos != null &&
    Math.abs(meanMovingPos) >= MIN_POSITION_BIAS_CM * 0.8
  ) {
    const alphaFactor = meanMovingPos > 0 ? 1.08 : 0.92;
    pushSuggestion(suggestions, {
      param: "cartVelocityTrackingPerSec",
      label: "Cart velocity tracking α (1/s)",
      currentValue: current.cartVelocityTrackingPerSec,
      suggestedValue: clampSuggested(
        current.cartVelocityTrackingPerSec,
        current.cartVelocityTrackingPerSec * alphaFactor,
      ),
      confidence: "low",
      reason: "Jog transients differ — cart velocity tracking changes how quickly sim catches commanded speed.",
    });
  }

  const limitStepM = 0.01;
  if (simLeftEarly >= MIN_LIMIT_EARLY_EVENTS) {
    pushSuggestion(suggestions, {
      param: "limitLeftXM",
      label: "SIM_LIMIT_LEFT_X_M",
      currentValue: current.limitLeftXM,
      suggestedValue: current.limitLeftXM - limitStepM,
      confidence: limitMismatchRate >= 0.05 ? "medium" : "low",
      reason: "Sim hits the left limit before hardware — move the sim left limit slightly more negative.",
    });
  }
  if (simRightEarly >= MIN_LIMIT_EARLY_EVENTS) {
    pushSuggestion(suggestions, {
      param: "limitRightXM",
      label: "SIM_LIMIT_RIGHT_X_M",
      currentValue: current.limitRightXM,
      suggestedValue: current.limitRightXM + limitStepM,
      confidence: limitMismatchRate >= 0.05 ? "medium" : "low",
      reason: "Sim hits the right limit before hardware — move the sim right limit slightly more positive.",
    });
  }

  return { suggestions, diagnostics };
}

function fmtDelta(cm: number): string {
  const r = Math.round(cm * 10) / 10;
  return `${r >= 0 ? "+" : ""}${r}`;
}

/** Apply one suggestion onto a form copy (caller sets state / patches). */
export function applySuggestionToForm(form: SimConfigForm, suggestion: TuningSuggestion): SimConfigForm {
  return { ...form, [suggestion.param]: suggestion.suggestedValue };
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

export function formToConfigSnippet(form: SimConfigForm, jsonPath = "config/coupled-sim.parameters.json"): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  ).concat(`\n// Save as ${jsonPath} or use tuning.simConfig.patch / put via control-api.\n`);
}
