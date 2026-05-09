import { memo, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc";
import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";
import { cn } from "@/lib/utils";

/**
 * Horizontal rail view: motor position (**display** counts: left negative / right positive) mapped
 * into a running min/max range maintained by **control-api** (updates each `status.get`). Sensor Board
 * limits tint the left/right stops when the sensor is connected.
 */
export const CartRailVisualizer = memo(function CartRailVisualizer() {
  const utils = trpc.useUtils();
  const motor = useMotorStatusQuery();
  const sensor = trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.connected ? 80 : 1500),
  });
  const resetBoundsMutation = trpc.rail.bounds.reset.useMutation({
    onSuccess: () => void utils.status.get.invalidate(),
  });

  const motorConnected = motor.data?.connected ?? false;
  const pos = motorCountsForDisplay(motor.data?.measuredPosition);
  const bounds = motor.data?.railDisplayBounds ?? null;
  const sensorConnected = sensor.data?.connected ?? false;
  const limitLeft = sensor.data?.limitLeftPressed ?? false;
  const limitRight = sensor.data?.limitRightPressed ?? false;

  const resetScale = useCallback(() => {
    if (pos !== undefined && Number.isFinite(pos)) {
      void resetBoundsMutation.mutateAsync({ displayCounts: pos });
    }
  }, [pos, resetBoundsMutation]);

  const hasPosition = pos !== undefined && Number.isFinite(pos);
  /** Horizontal marker position (% from left). Uses display counts so increasing toward + matches **right** on screen. */
  let pct = 50;
  if (bounds && hasPosition) {
    const span = bounds.max - bounds.min;
    const t = span > 1e-9 ? (pos - bounds.min) / span : 0.5;
    pct = Math.max(3, Math.min(97, t * 100));
  }

  const rangeLabel =
    bounds && hasPosition
      ? `${bounds.min.toFixed(0)} → ${bounds.max.toFixed(0)} counts`
      : null;

  if (!motorConnected) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">Cart on rail</span>
        <div className="flex items-center gap-2">
          {rangeLabel ? (
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              {rangeLabel}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!hasPosition || resetBoundsMutation.isPending}
            onClick={resetScale}
            title="Set min/max to the current position (center the marker)"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            Reset scale
          </Button>
        </div>
      </div>

      <div
        className="relative h-12 w-full overflow-hidden rounded-lg border border-border bg-muted/40"
        role="img"
        aria-label={
          hasPosition && bounds
            ? `Cart about ${pct.toFixed(0)} percent from left along the visible session range (display counts)`
            : "Rail cart position"
        }
      >
        {/* Left / right stop zones — stronger when limit active; show session extent counts at each end */}
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 w-[10%] rounded-l-lg transition-colors",
            limitLeft && sensorConnected
              ? "bg-amber-500/35 shadow-[inset_0_0_12px_rgba(245,158,11,0.35)]"
              : "bg-muted/50",
          )}
        >
          {hasPosition && bounds ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center"
              title="Minimum display count this session (left end of range)"
            >
              <span className="text-muted-foreground font-mono text-[9px] tabular-nums">
                {bounds.min.toFixed(1)}
              </span>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "absolute top-0 right-0 bottom-0 w-[10%] rounded-r-lg transition-colors",
            limitRight && sensorConnected
              ? "bg-amber-500/35 shadow-[inset_0_0_12px_rgba(245,158,11,0.35)]"
              : "bg-muted/50",
          )}
        >
          {hasPosition && bounds ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center"
              title="Maximum display count this session (right end of range)"
            >
              <span className="text-muted-foreground font-mono text-[9px] tabular-nums">
                {bounds.max.toFixed(1)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="absolute inset-y-0 left-[10%] right-[10%] flex items-center justify-between gap-1 px-1">
          <span className="text-muted-foreground shrink-0 select-none font-mono text-[10px]">L</span>
          {hasPosition && bounds ? (
            <span
              className="min-w-0 truncate text-center font-mono text-[10px] text-foreground tabular-nums font-medium"
              title="Current display count"
            >
              {pos.toFixed(1)}
            </span>
          ) : null}
          <span className="text-muted-foreground shrink-0 select-none font-mono text-[10px]">R</span>
        </div>

        {hasPosition && bounds ? (
          <div
            className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md transition-[left] duration-150 ease-out"
            style={{ left: `${pct}%` }}
          >
            <span className="sr-only">cart marker</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-muted-foreground text-xs">
            Measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-[10px] leading-snug">
        Numbers match the status strip: left along the rail is negative, right is positive. End zones
        show min/max display counts recorded by the control API; center is current. Range grows as the
        cart moves (jogging included). Connect the Sensor Board to light limit zones when a switch
        closes.
      </p>
    </div>
  );
});
