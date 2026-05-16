import { memo } from "react";
import { boundsFromTravelLimitsCm } from "@/lib/railPositionCm";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { cn } from "@/lib/utils";

/**
 * Horizontal rail view using **travel limits** only (homing or limit-switch capture). No session
 * min/max. Sensor Board lights the stop zones when switches close.
 */
export const CartRailVisualizer = memo(function CartRailVisualizer() {
  const motor = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  const motorConnected = motor.data?.connected ?? false;
  const pos = motor.data?.positionCm;
  const tl = motor.data?.travelLimits;
  const bounds = boundsFromTravelLimitsCm(tl?.leftCm, tl?.rightCm);
  const sensorConnected = sensor.data?.connected ?? false;
  const limitLeft = sensor.data?.limitLeftPressed ?? false;
  const limitRight = sensor.data?.limitRightPressed ?? false;

  const twinSim =
    motor.data && "twinSimMotor" in motor.data ? motor.data.twinSimMotor : undefined;
  const simPos = twinSim !== undefined ? twinSim.positionCm : undefined;
  const simTl = twinSim?.travelLimits;
  const simBounds = boundsFromTravelLimitsCm(simTl?.leftCm, simTl?.rightCm);

  const hasPosition = pos !== undefined && Number.isFinite(pos);
  const span = bounds ? bounds.max - bounds.min : 0;
  const hasScale = bounds != null && span > 1e-9;

  let pct = 50;
  if (bounds && hasPosition && hasScale) {
    const t = (pos - bounds.min) / span;
    pct = Math.max(3, Math.min(97, t * 100));
  }

  const hasSimPosition = simPos !== undefined && Number.isFinite(simPos);
  const simSpan = simBounds ? simBounds.max - simBounds.min : 0;
  const simHasScale = simBounds != null && simSpan > 1e-9;
  let simPct = 50;
  if (simBounds && hasSimPosition && simHasScale) {
    const t = (simPos - simBounds.min) / simSpan;
    simPct = Math.max(3, Math.min(97, t * 100));
  }

  const rangeLabel =
    hasScale && bounds
      ? `${bounds.min.toFixed(2)} → ${bounds.max.toFixed(2)} cm`
      : null;

  if (!motorConnected) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">Cart on rail</span>
        {rangeLabel ? (
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">{rangeLabel}</span>
        ) : null}
      </div>

      <div
        className="relative h-12 w-full overflow-hidden rounded-lg border border-border bg-muted/40"
        role="img"
        aria-label={
          hasPosition && hasScale
            ? `Cart about ${pct.toFixed(0)} percent from left along travel limits (cm)`
            : "Rail cart position"
        }
      >
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 w-[10%] rounded-l-lg transition-colors",
            limitLeft && sensorConnected
              ? "bg-amber-500/35 shadow-[inset_0_0_12px_rgba(245,158,11,0.35)]"
              : "bg-muted/50",
          )}
        >
          {hasPosition ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center"
              title="Left travel limit (cm)"
            >
              <span className="text-muted-foreground font-mono text-[9px] tabular-nums">
                {bounds && hasScale ? bounds.min.toFixed(2) : "—"}
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
          {hasPosition ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center"
              title="Right travel limit (cm)"
            >
              <span className="text-muted-foreground font-mono text-[9px] tabular-nums">
                {bounds && hasScale ? bounds.max.toFixed(2) : "—"}
              </span>
            </div>
          ) : null}
        </div>
        <div className="absolute inset-y-0 left-[10%] right-[10%] flex items-center justify-between gap-1 px-1">
          <span className="text-muted-foreground shrink-0 select-none font-mono text-[10px]">L</span>
          {hasPosition ? (
            <span
              className="min-w-0 truncate text-center font-mono text-[10px] text-foreground tabular-nums font-medium"
              title="Current position (cm)"
            >
              {pos.toFixed(2)}
            </span>
          ) : null}
          <span className="text-muted-foreground shrink-0 select-none font-mono text-[10px]">R</span>
        </div>

        {hasPosition && hasScale ? (
          <div
            className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md transition-[left] duration-150 ease-out"
            style={{ left: `${pct}%` }}
          >
            <span className="sr-only">cart marker (hardware)</span>
          </div>
        ) : !hasPosition ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-muted-foreground text-xs">
            Measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.
          </div>
        ) : null}
        {twinSim !== undefined && hasSimPosition && simHasScale ? (
          <div
            className="absolute top-1/2 z-[9] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-800 bg-sky-400/90 shadow-md transition-[left] duration-150 ease-out dark:border-sky-200"
            style={{ left: `${simPct}%` }}
            title="Simulated cart (coupled plant)"
          >
            <span className="sr-only">simulated cart marker</span>
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground text-[10px] leading-snug">
        Same sign convention as the status strip (left negative, right positive). The bar scales after
        both travel limits exist (homing or jog to limits). Connect the Sensor Board to highlight stop
        zones when a switch closes.
        {twinSim !== undefined ? (
          <>
            {" "}
            <span className="text-sky-800 dark:text-sky-200">
              Twin: large dot = hardware cart, small sky dot = simulated cart (independent sim travel
              limits when homed in sim).
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
});
