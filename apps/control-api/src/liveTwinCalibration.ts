import { readCoupledSimParametersFile } from "@real-pendulum/app-config/coupled-sim-parameters";
import { patchCoupledSimConfigFile } from "./coupledSimConfigFile.js";
import { fetchTuningCompare } from "./tuningCompare.js";
import { sampleFromCompare, type TuningSample } from "./tuningSample.js";
import {
  blendParams,
  fitTwinCalibrationParams,
  MIN_CALIBRATION_SAMPLES,
} from "./twinCalibrationOptimize.js";
import { summarizeReplayError } from "./tuningReplay.js";
import {
  applyCoupledSimRuntimePatch,
  coupledSimParametersToRuntimePatch,
} from "./tuningSimAdmin.js";
import {
  coupledSimPatchFromParams,
  DEFAULT_CALIBRATION_WEIGHTS,
  paramsFromCoupledSim,
  type LiveTwinCalibrationStatus,
  type TwinCalibrationMetrics,
  type TwinCalibrationParams,
} from "./twinCalibrationTypes.js";

/** Sample twin compare while calibrating (~10 Hz). */
export const CALIBRATION_SAMPLE_MS = 100;

/** Re-fit sim parameters on the rolling window (~every 2 s). */
export const CALIBRATION_OPTIMIZE_MS = 2000;

const WINDOW_MAX = 256;

/** Smooth sim parameter updates (0 = frozen, 1 = jump to fit). */
const PARAM_BLEND_ALPHA = 0.3;

let active = false;
let persistToFileOnStop = false;
let window: TuningSample[] = [];
let parameters: TwinCalibrationParams | null = null;
let baselineParameters: TwinCalibrationParams | null = null;
let updateCount = 0;
let lastSampleAt: number | null = null;
let lastOptimizeAt: number | null = null;
let lastOptimizeError: string | null = null;
let metrics: TwinCalibrationMetrics = emptyMetrics();

let sampleTimer: ReturnType<typeof setInterval> | null = null;
let sampleInFlight = false;
let lastSampleT = 0;

export type LiveCalibrationDeps = {
  fetchCompare: typeof fetchTuningCompare;
  applyRuntimePatch: typeof applyCoupledSimRuntimePatch;
  readBaseline: () => TwinCalibrationParams;
};

const defaultDeps: LiveCalibrationDeps = {
  fetchCompare: fetchTuningCompare,
  applyRuntimePatch: applyCoupledSimRuntimePatch,
  readBaseline: () => paramsFromCoupledSim(readCoupledSimParametersFile()),
};

let deps: LiveCalibrationDeps = defaultDeps;

function emptyMetrics(): TwinCalibrationMetrics {
  return {
    score: 0,
    meanAbsPositionCm: null,
    meanAbsEncoder: 0,
    livePositionDeltaCm: null,
    liveEncoderDelta: 0,
  };
}

function pushSample(row: TuningSample): void {
  window.push(row);
  if (window.length > WINDOW_MAX) {
    window = window.slice(-WINDOW_MAX);
  }
}

function liveMetricsFromCompare(
  compare: Awaited<ReturnType<typeof fetchTuningCompare>>,
): Pick<TwinCalibrationMetrics, "livePositionDeltaCm" | "liveEncoderDelta"> {
  const realPos = compare.real.motor.positionCm;
  const simPos = compare.sim.motor.positionCm;
  const livePositionDeltaCm =
    realPos !== undefined &&
    simPos !== undefined &&
    compare.real.motor.connected &&
    compare.sim.motor.connected
      ? realPos - simPos
      : null;
  return {
    livePositionDeltaCm,
    liveEncoderDelta: compare.real.sensor.encoderTicks - compare.sim.sensor.encoderTicks,
  };
}

async function recomputeReplayMetrics(): Promise<void> {
  if (!parameters || window.length === 0) {
    metrics = { ...metrics, score: 0, meanAbsPositionCm: null, meanAbsEncoder: 0 };
    return;
  }
  const s = await summarizeReplayError(window, parameters, DEFAULT_CALIBRATION_WEIGHTS);
  metrics = {
    ...metrics,
    score: s.score,
    meanAbsPositionCm: s.meanAbsPositionCm,
    meanAbsEncoder: s.meanAbsEncoder,
  };
}

async function applyParametersToSim(next: TwinCalibrationParams): Promise<void> {
  parameters = next;
  const runtime = await deps.applyRuntimePatch(
    coupledSimParametersToRuntimePatch(coupledSimPatchFromParams(next)),
  );
  if (!runtime.ok) {
    lastOptimizeError = runtime.error ?? "Sim runtime PATCH failed";
  }
}

async function runOptimizeStep(): Promise<void> {
  if (!active || !parameters || window.length < MIN_CALIBRATION_SAMPLES) return;
  if (!window.some((s) => s.realMotorCm != null)) return;

  const fit = await fitTwinCalibrationParams(window, parameters, DEFAULT_CALIBRATION_WEIGHTS);
  lastOptimizeAt = Date.now();
  if (!fit) {
    lastOptimizeError = "Not enough motion/position data in window";
    return;
  }

  const blended = blendParams(parameters, fit.params, PARAM_BLEND_ALPHA);
  await applyParametersToSim(blended);
  updateCount += 1;
  lastOptimizeError = null;
  await recomputeReplayMetrics();
}

async function calibrationTick(): Promise<void> {
  if (!active || sampleInFlight) return;
  sampleInFlight = true;
  try {
    const now = Date.now();
    if (now - lastSampleT < CALIBRATION_SAMPLE_MS) return;
    lastSampleT = now;

    const compare = await deps.fetchCompare();
    pushSample(sampleFromCompare(compare, now));
    lastSampleAt = now;

    const live = liveMetricsFromCompare(compare);
    metrics = { ...metrics, ...live };
    void recomputeReplayMetrics();

    if (
      lastOptimizeAt === null ||
      now - lastOptimizeAt >= CALIBRATION_OPTIMIZE_MS
    ) {
      await runOptimizeStep();
    }
  } finally {
    sampleInFlight = false;
  }
}

function stopTimers(): void {
  if (sampleTimer !== null) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

export function setLiveCalibrationDepsForTests(next: LiveCalibrationDeps | null): void {
  deps = next ?? defaultDeps;
}

export function getLiveTwinCalibrationStatus(): LiveTwinCalibrationStatus {
  return {
    active,
    windowSampleCount: window.length,
    updateCount,
    lastSampleAt,
    lastOptimizeAt,
    lastOptimizeError,
    metrics,
    parameters: parameters ?? baselineParameters ?? deps.readBaseline(),
    baselineParameters: baselineParameters ?? deps.readBaseline(),
    persistToFileOnStop,
  };
}

export async function startLiveTwinCalibration(options?: {
  persistToFileOnStop?: boolean;
}): Promise<LiveTwinCalibrationStatus> {
  if (active) return getLiveTwinCalibrationStatus();

  baselineParameters = deps.readBaseline();
  parameters = { ...baselineParameters };
  window = [];
  updateCount = 0;
  lastSampleAt = null;
  lastOptimizeAt = null;
  lastOptimizeError = null;
  metrics = emptyMetrics();
  persistToFileOnStop = options?.persistToFileOnStop ?? false;
  lastSampleT = 0;

  active = true;
  stopTimers();
  sampleTimer = setInterval(() => {
    void calibrationTick();
  }, CALIBRATION_SAMPLE_MS);
  void calibrationTick();

  return getLiveTwinCalibrationStatus();
}

export async function stopLiveTwinCalibration(): Promise<LiveTwinCalibrationStatus> {
  active = false;
  stopTimers();

  if (persistToFileOnStop && parameters) {
    await patchCoupledSimConfigFile(coupledSimPatchFromParams(parameters));
  }

  return getLiveTwinCalibrationStatus();
}

export async function resetLiveTwinCalibrationWindow(): Promise<LiveTwinCalibrationStatus> {
  window = [];
  lastOptimizeAt = null;
  await recomputeReplayMetrics();
  return getLiveTwinCalibrationStatus();
}

export async function resetLiveTwinCalibrationToBaseline(): Promise<LiveTwinCalibrationStatus> {
  baselineParameters = deps.readBaseline();
  parameters = { ...baselineParameters };
  await applyParametersToSim(parameters);
  window = [];
  updateCount = 0;
  lastOptimizeError = null;
  await recomputeReplayMetrics();
  return getLiveTwinCalibrationStatus();
}

/** Test teardown. */
export function resetLiveTwinCalibrationForTests(): void {
  void stopLiveTwinCalibration();
  window = [];
  parameters = null;
  baselineParameters = null;
  updateCount = 0;
  metrics = emptyMetrics();
  deps = defaultDeps;
}
