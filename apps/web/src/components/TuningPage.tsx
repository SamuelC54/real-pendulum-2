import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CircleStop, Download, Play, Trash2 } from "lucide-react";
import { JogControls } from "@/components/JogControls";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  configToForm,
  formToConfigSnippet,
  formToPatch,
  summarizeTuningError,
  type SimConfigForm,
  type TuningSample,
} from "@/lib/tuningMath";
import {
  applyOptimizedToForm,
  MIN_OPTIMIZE_SAMPLES,
  optimizeSimTuning,
  type TuningParamChange,
} from "@/lib/tuningOptimize";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { TUNING_COMPARE_POLL_IDLE_MS } from "@/stores/tuningSession";
import { tuningErrorWeightsAtom, tuningProfileAtom } from "@/stores/tuningProfile";
import {
  encoderCountsPerRevolution,
  encoderTicksPerRadian,
  plantGravityMS2,
} from "@/lib/pendulumEncoder";
import { displayCountsPerCm, metersPerDisplayCount } from "@/lib/railPositionCm";
import { simLimitLeftXM, simLimitRightXM } from "@/lib/simLimits";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}

function DeltaCell({ real, sim }: { real: number | null; sim: number | null }) {
  if (real == null || sim == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const d = real - sim;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        Math.abs(d) < 0.5 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300",
      )}
    >
      {d >= 0 ? "+" : ""}
      {fmt(d)}
    </span>
  );
}

function OptimizedParamRow({ change }: { change: TuningParamChange }) {
  return (
    <li className="border-border/60 border-b py-2 last:border-0 last:pb-0">
      <span className="font-mono text-xs font-medium">{change.label}</span>
      <span className="text-muted-foreground mt-0.5 block font-mono text-xs tabular-nums">
        {fmt(change.currentValue, 6)} → {fmt(change.optimizedValue, 6)}
      </span>
    </li>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step ?? "any"}
        className="border-input bg-background h-8 rounded-md border px-2 font-mono text-sm tabular-nums"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function TuningPage() {
  const [mode, setMode] = useAtom(grpcBackendModeAtom);
  const [weights] = useAtom(tuningErrorWeightsAtom);
  const [savedProfile, setSavedProfile] = useAtom(tuningProfileAtom);

  const utils = trpc.useUtils();

  const recordStatus = trpc.tuning.record.status.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: (q) => (q.state.data?.recording ? 400 : 2000),
  });
  const recording = recordStatus.data?.recording ?? false;

  const samplesQuery = trpc.tuning.record.samples.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: recording ? 500 : false,
  });
  const samples: TuningSample[] = samplesQuery.data ?? [];

  const startRecord = trpc.tuning.record.start.useMutation({
    onSuccess: () => {
      void utils.tuning.record.status.invalidate();
      void utils.tuning.record.samples.invalidate();
    },
  });
  const stopRecord = trpc.tuning.record.stop.useMutation({
    onSuccess: () => {
      void utils.tuning.record.status.invalidate();
      void utils.tuning.record.samples.invalidate();
    },
  });
  const clearRecord = trpc.tuning.record.clear.useMutation({
    onSuccess: () => {
      void utils.tuning.record.status.invalidate();
      void utils.tuning.record.samples.invalidate();
    },
  });

  const compare = trpc.tuning.compare.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: TUNING_COMPARE_POLL_IDLE_MS,
  });

  const simConfigQuery = trpc.tuning.simConfig.get.useQuery(undefined, {
    enabled: mode === "twin",
    retry: 1,
  });
  const patchSim = trpc.tuning.simConfig.patch.useMutation({
    onSuccess: (data) => {
      void simConfigQuery.refetch();
      if (data.ok && data.config) setForm(configToForm(data.config));
    },
  });

  const [form, setForm] = useState<SimConfigForm | null>(null);

  useEffect(() => {
    if (simConfigQuery.data?.ok && simConfigQuery.data.config) {
      setForm(configToForm(simConfigQuery.data.config));
    }
  }, [simConfigQuery.data]);

  const summary = useMemo(() => summarizeTuningError(samples, weights), [samples, weights]);

  const optimization = useMemo(() => {
    if (!form || samples.length < MIN_OPTIMIZE_SAMPLES) return null;
    return optimizeSimTuning(samples, form, weights);
  }, [samples, form, weights]);

  const applyOptimizedProfile = useCallback(() => {
    if (!form || !optimization) return;
    setForm(applyOptimizedToForm(form, optimization.optimized));
  }, [form, optimization]);

  const live = compare.data;
  const realPos = live?.real.motor.positionCm;
  const simPos = live?.sim.motor.positionCm;

  const exportCsv = useCallback(async () => {
    const csv = await utils.client.tuning.record.exportCsv.query();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twin-tuning-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [utils.client.tuning.record.exportCsv]);

  const applyForm = () => {
    if (!form) return;
    patchSim.mutate(formToPatch(form));
  };

  if (mode !== "twin") {
    return (
      <div className="grid grid-cols-1 gap-5 pb-10 lg:grid-cols-3 lg:items-start">
        <JogControls showMoveToHome />
        <Card className="p-6 lg:col-span-2">
          <h1 className="text-lg font-semibold">Twin tuning</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Compare hardware and simulation side by side, record traces, and tune coupled-sim parameters.
            Switch the header backend to <strong className="text-foreground">Twin</strong> and connect motor
            + sensor on the Control page first.
          </p>
          <Button type="button" className="mt-4" onClick={() => setMode("twin")}>
            Enable Twin mode
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 pb-10 lg:grid-cols-3 lg:items-start">
      <JogControls showMoveToHome />
      <div className="flex flex-col gap-5 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Twin tuning</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Record traces while jogging from the left column. Tune plant physics and apply patches live to
            the coupled sim (requires <code className="text-foreground">serve:coupled-sim</code>).
            Samples are captured on control-api while recording (continues on the Control tab).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!recording ? (
            <Button
              type="button"
              size="sm"
              disabled={startRecord.isPending}
              onClick={() => startRecord.mutate()}
            >
              <Play className="mr-2 h-4 w-4" aria-hidden />
              Record
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={stopRecord.isPending}
              onClick={() => stopRecord.mutate()}
            >
              <CircleStop className="mr-2 h-4 w-4" aria-hidden />
              Stop
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={samples.length === 0}
            onClick={() => void exportCsv()}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={samples.length === 0 || clearRecord.isPending}
            onClick={() => clearRecord.mutate()}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Clear
          </Button>
        </div>
      </div>

      {compare.isError ? (
        <p className="text-destructive text-sm">{compare.error.message}</p>
      ) : null}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-sky-600" aria-hidden />
          Live comparison
          {recording ? (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
              REC
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border text-xs">
                <th className="pb-2 pr-4 font-medium">Signal</th>
                <th className="pb-2 pr-4 font-medium">Hardware</th>
                <th className="pb-2 pr-4 font-medium">Simulation</th>
                <th className="pb-2 font-medium">Δ (real − sim)</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 font-sans">Cart (cm)</td>
                <td className="py-2 pr-4 tabular-nums">{fmt(realPos ?? null)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmt(simPos ?? null)}</td>
                <td className="py-2">
                  <DeltaCell real={realPos ?? null} sim={simPos ?? null} />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 font-sans">Encoder ticks</td>
                <td className="py-2 pr-4 tabular-nums">{live?.real.sensor.encoderTicks ?? "—"}</td>
                <td className="py-2 pr-4 tabular-nums">{live?.sim.sensor.encoderTicks ?? "—"}</td>
                <td className="py-2">
                  <DeltaCell
                    real={live?.real.sensor.encoderTicks ?? null}
                    sim={live?.sim.sensor.encoderTicks ?? null}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-medium">Session error score</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Lower is better. Based on {summary.sampleCount} recorded samples.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Weighted score</dt>
            <dd className="font-mono font-semibold tabular-nums">{fmt(summary.score, 2)}</dd>
            <dt className="text-muted-foreground">Mean |Δ position| (cm)</dt>
            <dd className="font-mono tabular-nums">{fmt(summary.meanAbsPositionCm, 2)}</dd>
            <dt className="text-muted-foreground">Mean |Δ encoder|</dt>
            <dd className="font-mono tabular-nums">{fmt(summary.meanAbsEncoder, 1)}</dd>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium">Optimized profile</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Replays your recording through the cart–pendulum plant and searches parameters that minimize
            hardware vs sim error (position and encoder only).
          </p>
          {samples.length < MIN_OPTIMIZE_SAMPLES ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Record at least {MIN_OPTIMIZE_SAMPLES} samples (a short jog is enough) to run optimization.
            </p>
          ) : optimization == null ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Need cart position in the recording — jog or move while Record is on.
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Replay score (current)</dt>
                <dd className="font-mono tabular-nums">{fmt(optimization.diagnostics.baselineScore, 3)}</dd>
                <dt className="text-muted-foreground">Replay score (optimized)</dt>
                <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmt(optimization.diagnostics.optimizedScore, 3)}
                </dd>
                <dt className="text-muted-foreground">Improvement</dt>
                <dd className="font-mono tabular-nums">{fmt(optimization.diagnostics.scoreImprovement, 3)}</dd>
                <dt className="text-muted-foreground">Samples used</dt>
                <dd className="font-mono tabular-nums">
                  {optimization.diagnostics.optimizeSampleCount} / {optimization.diagnostics.sampleCount}
                </dd>
              </dl>
              {optimization.changes.length > 0 ? (
                <ul className="mt-3 border-t border-border/60 pt-3">
                  {optimization.changes.map((c) => (
                    <OptimizedParamRow key={c.param} change={c} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-xs">
                  Current parameters already minimize replay error on this session (within search bounds).
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                disabled={!form || optimization.changes.length === 0}
                onClick={applyOptimizedProfile}
              >
                Apply optimized to form
              </Button>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Suggested test motions</h2>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>Short jog left / right, then stop</li>
          <li>Constant-speed jog across mid-span</li>
          <li>Sudden stop from motion</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-[11px]">
          Start Record, then jog from the left column (or homing on Control) while the trace keeps running.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Coupled simulation parameters</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Rail position scale is shared with hardware:{" "}
          <span className="font-mono text-foreground">{displayCountsPerCm()}</span> display counts/cm (
          <span className="font-mono text-foreground">{metersPerDisplayCount().toExponential(4)}</span>{" "}
          m/count from <code className="text-foreground">config.rail.displayCountsPerCm</code>). Pendulum
          encoder:{" "}
          <span className="font-mono text-foreground">{encoderCountsPerRevolution()}</span> counts/rev (
          <span className="font-mono text-foreground">{encoderTicksPerRadian().toFixed(2)}</span> ticks/rad
          from <code className="text-foreground">config.pendulum.encoderCountsPerRevolution</code>). Gravity{" "}
          <span className="font-mono text-foreground">{plantGravityMS2()}</span> m/s² is fixed in{" "}
          <code className="text-foreground">config.pendulum.gravityMS2</code>. Sim limit positions are fixed in{" "}
          <code className="text-foreground">config.sim.limitLeftXM</code> /{" "}
          <code className="text-foreground">limitRightXM</code> (
          <span className="font-mono text-foreground">{simLimitLeftXM()}</span> /{" "}
          <span className="font-mono text-foreground">{simLimitRightXM()}</span> m). Tune cart speed and plant
          dynamics below.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Plant and sim motion values are stored in{" "}
          <code className="text-foreground">config/coupled-sim.parameters.json</code>
          {simConfigQuery.data?.path ? (
            <>
              {" "}
              (<span className="break-all font-mono text-[10px]">{simConfigQuery.data.path}</span>)
            </>
          ) : null}
          . Read/write via <code className="text-foreground">tuning.simConfig.get</code>,{" "}
          <code className="text-foreground">patch</code>, or <code className="text-foreground">put</code>.
        </p>
        {simConfigQuery.data && !simConfigQuery.data.ok ? (
          <p className="text-destructive mt-2 text-xs">{simConfigQuery.data.error}</p>
        ) : null}
        {form ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ConfigField
                label="SIM_MPS_PER_RPM"
                value={form.mpsPerRpm}
                onChange={(v) => setForm({ ...form, mpsPerRpm: v })}
                step="0.000001"
              />
              <ConfigField
                label="Pendulum length (m)"
                value={form.pendulumLengthM}
                onChange={(v) => setForm({ ...form, pendulumLengthM: v })}
              />
              <ConfigField
                label="Cart velocity tracking α (1/s)"
                value={form.cartVelocityTrackingPerSec}
                onChange={(v) => setForm({ ...form, cartVelocityTrackingPerSec: v })}
              />
              <ConfigField
                label="Angular damping (1/s)"
                value={form.angularDampingPerSec}
                onChange={(v) => setForm({ ...form, angularDampingPerSec: v })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={patchSim.isPending} onClick={applyForm}>
                Save JSON & apply to sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSavedProfile(form);
                  void navigator.clipboard.writeText(
                    formToConfigSnippet(form, simConfigQuery.data?.path),
                  );
                }}
              >
                Copy JSON
              </Button>
              {savedProfile ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm(savedProfile)}>
                  Load saved profile
                </Button>
              ) : null}
            </div>
            {patchSim.error ? (
              <p className="text-destructive mt-2 text-xs">{patchSim.error.message}</p>
            ) : null}
            {patchSim.isSuccess && patchSim.data?.ok ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Saved to JSON
                {patchSim.data.runtimeApplied
                  ? " and applied to the running coupled sim."
                  : patchSim.data.runtimeWarning
                    ? ` (${patchSim.data.runtimeWarning})`
                    : "."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">Loading sim config…</p>
        )}
      </Card>
      </div>
    </div>
  );
}
