import type { TuningSample } from "@/lib/tuningMath";

export const TUNING_CHART_MAX_POINTS = 1500;

export type TuningChartRow = {
  tSec: number;
  commandedRpm?: number;
  realMotorCm?: number;
  simMotorCm?: number;
  realEncoderTicks?: number;
  simEncoderTicks?: number;
};

export function downsampleTuningSamples(samples: TuningSample[], maxPoints = TUNING_CHART_MAX_POINTS): TuningSample[] {
  if (samples.length <= maxPoints) return samples;
  const out: TuningSample[] = [];
  const last = maxPoints - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (samples.length - 1)) / last);
    out.push(samples[idx]!);
  }
  return out;
}

function finiteOrUndef(n: number | null | undefined): number | undefined {
  return n != null && Number.isFinite(n) ? n : undefined;
}

export function buildTuningChartRows(samples: TuningSample[]): TuningChartRow[] {
  if (samples.length === 0) return [];
  const t0 = samples[0]!.t;
  return downsampleTuningSamples(samples).map((s) => ({
    tSec: (s.t - t0) / 1000,
    commandedRpm: finiteOrUndef(s.commandedRpm),
    realMotorCm: finiteOrUndef(s.realMotorCm),
    simMotorCm: finiteOrUndef(s.simMotorCm),
    realEncoderTicks: finiteOrUndef(s.realEncoderTicks),
    simEncoderTicks: finiteOrUndef(s.simEncoderTicks),
  }));
}

export function formatChartTime(sec: number): string {
  if (sec < 1) return `${(sec * 1000).toFixed(0)} ms`;
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
