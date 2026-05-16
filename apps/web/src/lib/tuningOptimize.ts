import { replayTuningLoss, samplesWithReplayAsSim } from "@/lib/tuningReplay";
import {
  DEFAULT_TUNING_WEIGHTS,
  summarizeTuningError,
  type SimConfigForm,
  type TuningErrorWeights,
  type TuningSample,
} from "@/lib/tuningMath";

export const MIN_OPTIMIZE_SAMPLES = 8;
const MAX_SAMPLES_FOR_SEARCH = 96;
const MAX_PASSES = 5;

export type TuningParamKey = keyof SimConfigForm;

export type TuningParamChange = {
  param: TuningParamKey;
  label: string;
  currentValue: number;
  optimizedValue: number;
};

export type TuningOptimizationDiagnostics = {
  sampleCount: number;
  optimizeSampleCount: number;
  pairedPositionCount: number;
  baselineScore: number;
  optimizedScore: number;
  scoreImprovement: number;
  meanPositionDeltaCm: number | null;
  meanEncoderDelta: number;
  limitMismatchRate: number;
};

export type TuningOptimizationResult = {
  current: SimConfigForm;
  optimized: SimConfigForm;
  changes: TuningParamChange[];
  diagnostics: TuningOptimizationDiagnostics;
};

const PARAM_LABELS: Record<TuningParamKey, string> = {
  mpsPerRpm: "SIM_MPS_PER_RPM",
  pendulumLengthM: "Pendulum length (m)",
  cartVelocityTrackingPerSec: "Cart velocity tracking α (1/s)",
  angularDampingPerSec: "Angular damping (1/s)",
};

const SEARCH_ORDER: TuningParamKey[] = [
  "mpsPerRpm",
  "cartVelocityTrackingPerSec",
  "pendulumLengthM",
  "angularDampingPerSec",
];

type Bounds = { min: number; max: number; minStep: number };

const BOUNDS: Record<TuningParamKey, Bounds> = {
  mpsPerRpm: { min: 1e-9, max: 0.02, minStep: 1e-9 },
  pendulumLengthM: { min: 0.08, max: 1.5, minStep: 0.005 },
  cartVelocityTrackingPerSec: { min: 1, max: 60, minStep: 0.5 },
  angularDampingPerSec: { min: 0, max: 3, minStep: 0.01 },
};

const RELATIVE_STEP: Record<TuningParamKey, number> = {
  mpsPerRpm: 0.2,
  pendulumLengthM: 0.1,
  cartVelocityTrackingPerSec: 0.15,
  angularDampingPerSec: 0.2,
};

function subsampleForSearch(samples: TuningSample[], max = MAX_SAMPLES_FOR_SEARCH): TuningSample[] {
  if (samples.length <= max) return samples;
  const out: TuningSample[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (samples.length - 1)) / (max - 1));
    out.push(samples[idx]!);
  }
  return out;
}

function clampParam(key: TuningParamKey, value: number): number {
  const b = BOUNDS[key];
  return Math.max(b.min, Math.min(b.max, value));
}

function stepSize(key: TuningParamKey, value: number): number {
  const b = BOUNDS[key];
  const rel = RELATIVE_STEP[key];
  if (key === "mpsPerRpm") {
    return Math.max(b.minStep, Math.abs(value) * rel);
  }
  return Math.max(b.minStep, Math.abs(value) * rel);
}

function normalizeForm(form: SimConfigForm): SimConfigForm {
  return {
    mpsPerRpm: clampParam("mpsPerRpm", form.mpsPerRpm),
    pendulumLengthM: clampParam("pendulumLengthM", form.pendulumLengthM),
    cartVelocityTrackingPerSec: clampParam(
      "cartVelocityTrackingPerSec",
      form.cartVelocityTrackingPerSec,
    ),
    angularDampingPerSec: clampParam("angularDampingPerSec", form.angularDampingPerSec),
  };
}

function coordinateDescent(
  searchSamples: TuningSample[],
  start: SimConfigForm,
  weights: TuningErrorWeights,
): { form: SimConfigForm; score: number } {
  let best = normalizeForm(start);
  let bestScore = replayTuningLoss(searchSamples, best, weights);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (const key of SEARCH_ORDER) {
      const base = best[key];
      const delta = stepSize(key, base);
      const candidates = [
        clampParam(key, base + delta),
        clampParam(key, base - delta),
      ];
      if (key === "mpsPerRpm" && base > 0) {
        candidates.push(clampParam(key, base * 1.15), clampParam(key, base * 0.85));
      }

      for (const trialValue of candidates) {
        if (Math.abs(trialValue - base) < 1e-15) continue;
        const trial = normalizeForm({ ...best, [key]: trialValue });
        const score = replayTuningLoss(searchSamples, trial, weights);
        if (score < bestScore - 1e-10) {
          best = trial;
          bestScore = score;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return { form: best, score: bestScore };
}

function buildChanges(current: SimConfigForm, optimized: SimConfigForm): TuningParamChange[] {
  const changes: TuningParamChange[] = [];
  for (const param of SEARCH_ORDER) {
    const currentValue = current[param];
    const optimizedValue = optimized[param];
    if (Math.abs(optimizedValue - currentValue) < 1e-12) continue;
    changes.push({
      param,
      label: PARAM_LABELS[param],
      currentValue,
      optimizedValue,
    });
  }
  return changes;
}

/**
 * Find coupled-sim parameters that minimize replay error against recorded hardware samples.
 */
export function optimizeSimTuning(
  samples: TuningSample[],
  current: SimConfigForm,
  weights: TuningErrorWeights = DEFAULT_TUNING_WEIGHTS,
): TuningOptimizationResult | null {
  if (samples.length < MIN_OPTIMIZE_SAMPLES) return null;
  if (!samples.some((s) => s.realMotorCm != null)) return null;

  const searchSamples = subsampleForSearch(samples);
  const normalizedCurrent = normalizeForm(current);
  const baselineScore = replayTuningLoss(searchSamples, normalizedCurrent, weights);
  const { form: optimized, score: optimizedScore } = coordinateDescent(
    searchSamples,
    normalizedCurrent,
    weights,
  );

  const replayed = samplesWithReplayAsSim(samples, optimized);
  const summary = summarizeTuningError(replayed, weights);
  const posDeltas = replayed
    .filter((s) => s.realMotorCm != null && s.simMotorCm != null)
    .map((s) => s.realMotorCm! - s.simMotorCm!);

  const meanPositionDeltaCm =
    posDeltas.length > 0 ? posDeltas.reduce((a, b) => a + b, 0) / posDeltas.length : null;

  return {
    current: normalizedCurrent,
    optimized,
    changes: buildChanges(normalizedCurrent, optimized),
    diagnostics: {
      sampleCount: samples.length,
      optimizeSampleCount: searchSamples.length,
      pairedPositionCount: posDeltas.length,
      baselineScore,
      optimizedScore,
      scoreImprovement: baselineScore - optimizedScore,
      meanPositionDeltaCm,
      meanEncoderDelta: summary.meanAbsEncoder,
      limitMismatchRate: summary.limitMismatchRate,
    },
  };
}

export function applyOptimizedToForm(_form: SimConfigForm, optimized: SimConfigForm): SimConfigForm {
  return { ...optimized };
}
