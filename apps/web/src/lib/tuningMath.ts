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
  /** OLS slope Δreal/Δsim on motion segments (1 = scale matched). */
  positionDisplacementScale: number | null;
  positionDisplacementPairs: number;
  /** Median sim/real at paired samples with |real| above noise floor. */
  positionLevelRatioMedian: number | null;
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
/** Ignore tiny steps dominated by poll noise. */
const MIN_DISPLACEMENT_CM = 0.04;
const MIN_DISPLACEMENT_PAIRS = 6;
const MIN_SCALE_ERROR = 0.015;

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

/** OLS Δreal/Δsim while jogging (1 = matched motion; offset does not affect). */
function estimatePositionDisplacementScale(samples: TuningSample[]): {
  slope: number;
  pairCount: number;
  residualStdCm: number | null;
} | null {
  const paired = samples.filter(
    (s): s is TuningSample & { realMotorCm: number; simMotorCm: number } =>
      s.realMotorCm != null && s.simMotorCm != null,
  );
  if (paired.length < 2) return null;

  let sumDsDr = 0;
  let sumDs2 = 0;
  const residuals: number[] = [];
  let pairCount = 0;

  for (let i = 1; i < paired.length; i += 1) {
    const prev = paired[i - 1]!;
    const cur = paired[i]!;
    const dr = cur.realMotorCm - prev.realMotorCm;
    const ds = cur.simMotorCm - prev.simMotorCm;
    const moving =
      Math.abs(cur.commandedRpm) >= JOG_RPM_THRESHOLD ||
      Math.abs(prev.commandedRpm) >= JOG_RPM_THRESHOLD;
    if (!moving) continue;
    if (Math.abs(ds) < MIN_DISPLACEMENT_CM && Math.abs(dr) < MIN_DISPLACEMENT_CM) continue;

    sumDsDr += ds * dr;
    sumDs2 += ds * ds;
    pairCount += 1;
  }

  if (pairCount < MIN_DISPLACEMENT_PAIRS || sumDs2 <= 1e-12) return null;
  const slope = sumDsDr / sumDs2;
  if (!Number.isFinite(slope) || slope <= 0.2 || slope >= 5) return null;

  for (let i = 1; i < paired.length; i += 1) {
    const prev = paired[i - 1]!;
    const cur = paired[i]!;
    const dr = cur.realMotorCm - prev.realMotorCm;
    const ds = cur.simMotorCm - prev.simMotorCm;
    const moving =
      Math.abs(cur.commandedRpm) >= JOG_RPM_THRESHOLD ||
      Math.abs(prev.commandedRpm) >= JOG_RPM_THRESHOLD;
    if (!moving) continue;
    if (Math.abs(ds) < MIN_DISPLACEMENT_CM && Math.abs(dr) < MIN_DISPLACEMENT_CM) continue;
    residuals.push(dr - slope * ds);
  }

  return {
    slope,
    pairCount,
    residualStdCm: residuals.length > 1 ? stdDev(residuals) : null,
  };
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

  const displacementMotion = estimatePositionDisplacementScale(samples);
  const levelRatiosForDiag: number[] = [];
  for (const s of samples) {
    if (s.realMotorCm == null || s.simMotorCm == null) continue;
    if (Math.abs(s.realMotorCm) < MIN_POSITION_BIAS_CM * 4 || Math.abs(s.simMotorCm) < 1e-6) continue;
    const r = s.simMotorCm / s.realMotorCm;
    if (Number.isFinite(r) && r > 0.2 && r < 5) levelRatiosForDiag.push(r);
  }
  levelRatiosForDiag.sort((a, b) => a - b);

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
    positionDisplacementScale: displacementMotion?.slope ?? null,
    positionDisplacementPairs: displacementMotion?.pairCount ?? 0,
    positionLevelRatioMedian:
      levelRatiosForDiag.length > 0
        ? levelRatiosForDiag[Math.floor(levelRatiosForDiag.length / 2)]!
        : null,
  };

  if (samples.length < MIN_SAMPLES) {
    return { suggestions, diagnostics };
  }

  const displacementScale = displacementMotion?.slope ?? null;
  const scaleMismatch =
    displacementScale != null && Math.abs(1 - displacementScale) >= MIN_SCALE_ERROR;

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
  } else if (
    scaleMismatch &&
    displacementMotion != null &&
    !suggestions.some((s) => s.param === "mpsPerRpm")
  ) {
    const slope = displacementScale!;
    const factor = slope > 1 ? 1.05 : 0.95;
    const pct = Math.round(Math.abs(1 - slope) * 100);
    let reason =
      slope > 1
        ? `While jogging, hardware moves ~${pct}% more per step than sim (Δreal/Δsim ≈ ${slope.toFixed(2)}). Rail cm scale is fixed to hardware — increase SIM_MPS_PER_RPM.`
        : `While jogging, sim moves ~${pct}% more per step than hardware (Δreal/Δsim ≈ ${slope.toFixed(2)}). Rail cm scale is fixed to hardware — decrease SIM_MPS_PER_RPM.`;
    if (displacementMotion.residualStdCm != null && displacementMotion.residualStdCm > 0.4) {
      reason += ` Step residual ~${displacementMotion.residualStdCm.toFixed(2)} cm — also re-zero both sides if needed.`;
    }
    pushSuggestion(suggestions, {
      param: "mpsPerRpm",
      label: "SIM_MPS_PER_RPM",
      currentValue: current.mpsPerRpm,
      suggestedValue: clampSuggested(current.mpsPerRpm, current.mpsPerRpm * factor),
      confidence: confidenceFromSignal(
        displacementMotion.pairCount,
        Math.abs(1 - slope),
        MIN_SCALE_ERROR,
        displacementMotion.residualStdCm ?? 0,
      ),
      reason,
    });
  }

  if (meanEnc != null && Math.abs(meanEnc) >= MIN_ENCODER_BIAS) {
    const posSmall = meanPos == null || Math.abs(meanPos) < MIN_POSITION_BIAS_CM;
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
        reason: `Encoder mismatch ~${Math.round(Math.abs(meanEnc))} ticks with aligned cart — ticks/radian is fixed to hardware (config.pendulum.encoderCountsPerRevolution); tune pendulum damping or length.`,
      });
    } else if (Math.abs(meanEnc) >= MIN_ENCODER_BIAS * 3) {
      const lenFactor = meanEnc > 0 ? 1.03 : 0.97;
      pushSuggestion(suggestions, {
        param: "pendulumLengthM",
        label: "Pendulum length (m)",
        currentValue: current.pendulumLengthM,
        suggestedValue: clampSuggested(current.pendulumLengthM, current.pendulumLengthM * lenFactor),
        confidence: "low",
        reason: `Mean encoder Δ ~${Math.round(meanEnc)} ticks — shaft scale matches hardware; try pendulum length or angular damping.`,
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
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
};

export function configToForm(c: {
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  plant: {
    pendulumLengthM: number;
    cartVelocityTrackingPerSec: number;
    angularDampingPerSec: number;
  };
}): SimConfigForm {
  return {
    mpsPerRpm: c.mpsPerRpm,
    limitLeftXM: c.limitLeftXM,
    limitRightXM: c.limitRightXM,
    gravity: c.plant.gravity,
    pendulumLengthM: c.plant.pendulumLengthM,
    cartVelocityTrackingPerSec: c.plant.cartVelocityTrackingPerSec,
    angularDampingPerSec: c.plant.angularDampingPerSec,
  };
}

export function formToPatch(form: SimConfigForm) {
  return {
    mpsPerRpm: form.mpsPerRpm,
    limitLeftXM: form.limitLeftXM,
    limitRightXM: form.limitRightXM,
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
      limitLeftXM: form.limitLeftXM,
      limitRightXM: form.limitRightXM,
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
