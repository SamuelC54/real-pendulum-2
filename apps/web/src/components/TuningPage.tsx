import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CircleStop, Download, Play, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  configToForm,
  formToConfigSnippet,
  formToPatch,
  samplesToCsv,
  summarizeTuningError,
  type SimConfigForm,
} from "@/lib/tuningMath";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { tuningRecordingAtom, tuningSamplesAtom } from "@/stores/tuningSession";
import { tuningErrorWeightsAtom, tuningProfileAtom } from "@/stores/tuningProfile";
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

  const [recording, setRecording] = useAtom(tuningRecordingAtom);
  const [samples, setSamples] = useAtom(tuningSamplesAtom);

  const compare = trpc.tuning.compare.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: recording ? 120 : 400,
  });

  const simConfigQuery = trpc.tuning.simConfig.get.useQuery(undefined, {
    enabled: mode === "twin",
    retry: 1,
  });
  const patchSim = trpc.tuning.simConfig.patch.useMutation({
    onSuccess: () => void simConfigQuery.refetch(),
  });

  const [form, setForm] = useState<SimConfigForm | null>(null);

  useEffect(() => {
    if (simConfigQuery.data?.ok && simConfigQuery.data.config) {
      setForm(configToForm(simConfigQuery.data.config));
    }
  }, [simConfigQuery.data]);

  const summary = useMemo(() => summarizeTuningError(samples, weights), [samples, weights]);

  const live = compare.data;
  const realPos = live?.real.motor.positionCm;
  const simPos = live?.sim.motor.positionCm;

  const exportCsv = useCallback(() => {
    const blob = new Blob([samplesToCsv(samples)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twin-tuning-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [samples]);

  const applyForm = () => {
    if (!form) return;
    patchSim.mutate(formToPatch(form));
  };

  if (mode !== "twin") {
    return (
      <Card className="mx-auto max-w-2xl p-6">
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
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Twin tuning</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
            Start recording here, switch to Control for jog/homing — recording continues across tabs. Tune
            and plant physics; apply patches live to the coupled sim (requires{" "}
            <code className="text-foreground">serve:coupled-sim</code>).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!recording ? (
            <Button type="button" size="sm" onClick={() => setRecording(true)}>
              <Play className="mr-2 h-4 w-4" aria-hidden />
              Record
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => setRecording(false)}>
              <CircleStop className="mr-2 h-4 w-4" aria-hidden />
              Stop
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={samples.length === 0}
            onClick={exportCsv}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={samples.length === 0}
            onClick={() => setSamples([])}
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
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 font-sans">Commanded RPM</td>
                <td className="py-2 pr-4 tabular-nums">{fmt(live?.real.motor.commandedRpm)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmt(live?.sim.motor.commandedRpm)}</td>
                <td className="py-2">
                  <DeltaCell
                    real={live?.real.motor.commandedRpm ?? null}
                    sim={live?.sim.motor.commandedRpm ?? null}
                  />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-sans">Limits L / R</td>
                <td className="py-2 pr-4">
                  {live?.real.sensor.limitLeftPressed ? "L" : "·"} /{" "}
                  {live?.real.sensor.limitRightPressed ? "R" : "·"}
                </td>
                <td className="py-2 pr-4">
                  {live?.sim.sensor.limitLeftPressed ? "L" : "·"} /{" "}
                  {live?.sim.sensor.limitRightPressed ? "R" : "·"}
                </td>
                <td className="py-2 text-muted-foreground font-sans text-[11px]">
                  {live &&
                  (live.real.sensor.limitLeftPressed !== live.sim.sensor.limitLeftPressed ||
                    live.real.sensor.limitRightPressed !== live.sim.sensor.limitRightPressed)
                    ? "mismatch"
                    : "match"}
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
            <dt className="text-muted-foreground">Mean |Δ RPM|</dt>
            <dd className="font-mono tabular-nums">{fmt(summary.meanAbsRpm, 2)}</dd>
            <dt className="text-muted-foreground">Limit mismatch rate</dt>
            <dd className="font-mono tabular-nums">{(summary.limitMismatchRate * 100).toFixed(1)}%</dd>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium">Suggested test motions</h2>
          <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
            <li>Short jog left / right, then stop</li>
            <li>Constant-speed jog across mid-span</li>
            <li>Sudden stop from motion</li>
            <li>Full homing sequence</li>
            <li>Approach each limit switch slowly</li>
          </ul>
          <p className="text-muted-foreground mt-3 text-[11px]">
            Start Record on this tab, then use Control for jog/homing while the trace keeps running.
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Coupled simulation parameters</h2>
        {simConfigQuery.data && !simConfigQuery.data.ok ? (
          <p className="text-destructive mt-2 text-xs">{simConfigQuery.data.error}</p>
        ) : null}
        {form ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ConfigField
                label="SIM_METERS_PER_DISPLAY_COUNT"
                value={form.metersPerDisplayCount}
                onChange={(v) => setForm({ ...form, metersPerDisplayCount: v })}
                step="0.000001"
              />
              <ConfigField
                label="SIM_MPS_PER_RPM"
                value={form.mpsPerRpm}
                onChange={(v) => setForm({ ...form, mpsPerRpm: v })}
                step="0.000001"
              />
              <ConfigField
                label="SIM_LIMIT_LEFT_X_M"
                value={form.limitLeftXM}
                onChange={(v) => setForm({ ...form, limitLeftXM: v })}
              />
              <ConfigField
                label="SIM_LIMIT_RIGHT_X_M"
                value={form.limitRightXM}
                onChange={(v) => setForm({ ...form, limitRightXM: v })}
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
              <ConfigField
                label="Encoder ticks / radian"
                value={form.encoderTicksPerRadian}
                onChange={(v) => setForm({ ...form, encoderTicksPerRadian: v })}
              />
              <ConfigField
                label="Gravity (m/s²)"
                value={form.gravity}
                onChange={(v) => setForm({ ...form, gravity: v })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={patchSim.isPending} onClick={applyForm}>
                Apply to running sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSavedProfile(form);
                  void navigator.clipboard.writeText(formToConfigSnippet(form));
                }}
              >
                Save profile & copy config snippet
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
            {patchSim.isSuccess ? (
              <p className="text-muted-foreground mt-2 text-xs">Parameters applied to coupled sim plant.</p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">Loading sim config…</p>
        )}
      </Card>
    </div>
  );
}