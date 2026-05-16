import { fetchTuningCompare } from "./tuningCompare.js";
import { sampleFromCompare, samplesToCsv, type TuningSample } from "./tuningSample.js";

/** Minimum ms between logged samples while recording (50× former 80 ms). */
export const TUNING_SAMPLE_MIN_INTERVAL_MS = 80 / 50;

/** Poll interval while recording (50× former 120 ms). */
export const TUNING_COMPARE_POLL_RECORDING_MS = 120 / 50;

/** Ring buffer size — scaled with 50× sample rate (~10 min at ~400 Hz). */
export const TUNING_MAX_SAMPLES = 250_000;

export type TuningRecordStatus = {
  recording: boolean;
  sampleCount: number;
};

let recording = false;
let samples: TuningSample[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSampleT = 0;
let tickInFlight = false;

export type TuningRecordDeps = {
  fetchCompare: () => Promise<import("./tuningSample.js").TuningComparePayload>;
};

const defaultDeps: TuningRecordDeps = { fetchCompare: fetchTuningCompare };

let deps: TuningRecordDeps = defaultDeps;

export function setTuningRecordDepsForTests(next: TuningRecordDeps | null): void {
  deps = next ?? defaultDeps;
}

export function getTuningRecordStatus(): TuningRecordStatus {
  return { recording, sampleCount: samples.length };
}

export function getTuningSamples(): readonly TuningSample[] {
  return samples;
}

export function clearTuningSamples(): TuningRecordStatus {
  samples = [];
  return getTuningRecordStatus();
}

export function exportTuningSamplesCsv(): string {
  return samplesToCsv(samples);
}

function appendSample(row: TuningSample): void {
  samples.push(row);
  if (samples.length > TUNING_MAX_SAMPLES) {
    samples = samples.slice(-TUNING_MAX_SAMPLES);
  }
}

async function recordTick(): Promise<void> {
  if (!recording || tickInFlight) return;
  tickInFlight = true;
  try {
    const now = Date.now();
    if (now - lastSampleT < TUNING_SAMPLE_MIN_INTERVAL_MS) return;
    const compare = await deps.fetchCompare();
    appendSample(sampleFromCompare(compare, now));
    lastSampleT = now;
  } finally {
    tickInFlight = false;
  }
}

function stopPollTimer(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function startTuningRecord(): TuningRecordStatus {
  if (recording) return getTuningRecordStatus();
  recording = true;
  lastSampleT = 0;
  stopPollTimer();
  pollTimer = setInterval(() => {
    void recordTick();
  }, TUNING_COMPARE_POLL_RECORDING_MS);
  void recordTick();
  return getTuningRecordStatus();
}

export function stopTuningRecord(): TuningRecordStatus {
  recording = false;
  stopPollTimer();
  return getTuningRecordStatus();
}

/** Reset module state (tests). */
export function resetTuningRecordForTests(): void {
  stopTuningRecord();
  samples = [];
  lastSampleT = 0;
  tickInFlight = false;
  deps = defaultDeps;
}
