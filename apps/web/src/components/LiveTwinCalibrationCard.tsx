import { memo } from "react";
import { Radio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/trpc";

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}

export const LiveTwinCalibrationCard = memo(function LiveTwinCalibrationCard({
  onParametersChanged,
}: {
  onParametersChanged?: () => void;
}) {
  const utils = trpc.useUtils();

  const statusQuery = trpc.tuning.calibration.status.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.active ? 500 : 3000),
  });
  const status = statusQuery.data;
  const active = status?.active ?? false;

  const invalidate = () => {
    void utils.tuning.calibration.status.invalidate();
    void utils.tuning.compare.invalidate();
    void utils.tuning.simConfig.get.invalidate();
    onParametersChanged?.();
  };

  const start = trpc.tuning.calibration.start.useMutation({
    onSuccess: invalidate,
  });
  const stop = trpc.tuning.calibration.stop.useMutation({
    onSuccess: invalidate,
  });
  const resetBaseline = trpc.tuning.calibration.resetToBaseline.useMutation({
    onSuccess: invalidate,
  });

  const m = status?.metrics;
  const p = status?.parameters;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Live twin calibration</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Backend continuously compares real vs sim telemetry and updates coupled-sim parameters
            only (robot control is unchanged).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <Button
              type="button"
              size="sm"
              disabled={start.isPending}
              onClick={() => start.mutate({ persistToFileOnStop: true })}
            >
              <Radio className="mr-2 h-4 w-4" aria-hidden />
              Start calibration
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
            >
              <Square className="mr-2 h-4 w-4" aria-hidden />
              Stop
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={resetBaseline.isPending || active}
            onClick={() => resetBaseline.mutate()}
          >
            Reset sim to file
          </Button>
        </div>
      </div>

      {active ? (
        <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-400" role="status">
          Calibrating — {status?.windowSampleCount ?? 0} samples in window · {status?.updateCount ?? 0}{" "}
          sim updates
        </p>
      ) : null}

      {status?.lastOptimizeError ? (
        <p className="text-destructive mb-3 text-xs">{status.lastOptimizeError}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">Live Δ position (cm)</dt>
        <dd className="font-mono tabular-nums">{fmt(m?.livePositionDeltaCm, 2)}</dd>
        <dt className="text-muted-foreground">Live Δ encoder</dt>
        <dd className="font-mono tabular-nums">{fmt(m?.liveEncoderDelta, 1)}</dd>
        <dt className="text-muted-foreground">Replay score (window)</dt>
        <dd className="font-mono tabular-nums">{fmt(m?.score, 3)}</dd>
        <dt className="text-muted-foreground">Mean |Δ position| replay</dt>
        <dd className="font-mono tabular-nums">{fmt(m?.meanAbsPositionCm, 2)}</dd>
        <dt className="text-muted-foreground">Mean |Δ encoder| replay</dt>
        <dd className="font-mono tabular-nums">{fmt(m?.meanAbsEncoder, 1)}</dd>
      </dl>

      {p ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-3 font-mono text-[11px] tabular-nums">
          <dt className="text-muted-foreground font-sans">mpsPerRpm</dt>
          <dd>{p.mpsPerRpm}</dd>
          <dt className="text-muted-foreground font-sans">cart α (1/s)</dt>
          <dd>{p.cartVelocityTrackingPerSec}</dd>
          <dt className="text-muted-foreground font-sans">pendulum L (m)</dt>
          <dd>{p.pendulumLengthM}</dd>
          <dt className="text-muted-foreground font-sans">damping (1/s)</dt>
          <dd>{p.angularDampingPerSec}</dd>
        </dl>
      ) : null}
    </Card>
  );
});
