import { memo } from "react";
import { useAtomValue } from "jotai";
import { boundsFromTravelLimitsCm } from "@/lib/railPositionCm";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { cn } from "@/lib/utils";

type TravelLimitsCm = { leftCm: number | null; rightCm: number | null } | undefined;

function cartPercent(pos: number | undefined, bounds: ReturnType<typeof boundsFromTravelLimitsCm>) {
  const hasPosition = pos !== undefined && Number.isFinite(pos);
  const span = bounds ? bounds.max - bounds.min : 0;
  const hasScale = bounds != null && span > 1e-9;
  let pct = 50;
  if (bounds && hasPosition && hasScale) {
    const t = (pos - bounds.min) / span;
    pct = Math.max(3, Math.min(97, t * 100));
  }
  return { pct, hasPosition, hasScale };
}

function RailTrack({
  legLabel,
  connected,
  pos,
  travelLimits,
  limitLeft,
  limitRight,
  sensorConnected,
  cartClassName,
  cartTitle,
}: {
  legLabel: string;
  connected: boolean;
  pos: number | undefined;
  travelLimits: TravelLimitsCm;
  limitLeft: boolean;
  limitRight: boolean;
  sensorConnected: boolean;
  cartClassName: string;
  cartTitle: string;
}) {
  const bounds = boundsFromTravelLimitsCm(travelLimits?.leftCm, travelLimits?.rightCm);
  const { pct, hasPosition, hasScale } = cartPercent(pos, bounds);
  const rangeLabel =
    hasScale && bounds ? `${bounds.min.toFixed(2)} → ${bounds.max.toFixed(2)} cm` : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{legLabel}</span>
        {rangeLabel ? (
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">{rangeLabel}</span>
        ) : connected ? (
          <span className="text-muted-foreground text-[10px]">Record travel limits to scale</span>
        ) : null}
      </div>

      <div
        className={cn(
          "relative h-10 w-full overflow-hidden rounded-lg border border-border bg-muted/40",
          !connected && "opacity-60",
        )}
        role="img"
        aria-label={
          !connected
            ? `${legLabel} motor not connected`
            : hasPosition && hasScale
              ? `${legLabel} cart about ${pct.toFixed(0)} percent along travel limits`
              : `${legLabel} rail cart position`
        }
      >
        {!connected ? (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-muted-foreground text-[11px]">
            Not connected
          </div>
        ) : (
          <>
            <div
              className={cn(
                "absolute top-0 bottom-0 left-0 w-[10%] rounded-l-lg transition-colors",
                limitLeft && sensorConnected
                  ? "bg-amber-500/35 shadow-[inset_0_0_12px_rgba(245,158,11,0.35)]"
                  : "bg-muted/50",
              )}
            >
              {hasPosition ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center">
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center">
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
                  {pos!.toFixed(2)}
                </span>
              ) : null}
              <span className="text-muted-foreground shrink-0 select-none font-mono text-[10px]">R</span>
            </div>

            {hasPosition && hasScale ? (
              <div
                className={cn(
                  "absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md transition-[left] duration-150 ease-out",
                  cartClassName,
                )}
                style={{ left: `${pct}%` }}
                title={cartTitle}
              >
                <span className="sr-only">{legLabel} cart</span>
              </div>
            ) : hasPosition ? null : (
              <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-muted-foreground text-[11px]">
                Position unavailable
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontal rail view using **travel limits** only (homing or limit-switch capture). No session
 * min/max. Sensor Board lights the stop zones when switches close.
 *
 * In **twin** mode, shows separate **Hardware** and **Simulator** tracks.
 */
export const CartRailVisualizer = memo(function CartRailVisualizer() {
  const motor = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  const mode = useAtomValue(grpcBackendModeAtom);
  const twinSim =
    motor.data && "twinSimMotor" in motor.data ? motor.data.twinSimMotor : undefined;
  const twinSimSensor =
    sensor.data && "twinSimSensor" in sensor.data ? sensor.data.twinSimSensor : undefined;
  const isTwin = mode === "twin";

  const hardwareMotorConnected = motor.data?.connected ?? false;
  const simMotorConnected = twinSim?.connected ?? false;

  if (!isTwin) {
    if (!hardwareMotorConnected) return null;
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-muted-foreground text-xs font-medium">Cart on rail</span>
        <RailTrack
          legLabel="Cart"
          connected={hardwareMotorConnected}
          pos={motor.data?.positionCm}
          travelLimits={motor.data?.travelLimits}
          limitLeft={sensor.data?.limitLeftPressed ?? false}
          limitRight={sensor.data?.limitRightPressed ?? false}
          sensorConnected={sensor.data?.connected ?? false}
          cartClassName="bg-primary"
          cartTitle="Cart position (hardware)"
        />
        <p className="text-muted-foreground text-[10px] leading-snug">
          Same sign convention as the status strip (left negative, right positive). The bar scales
          after both travel limits exist (homing or jog to limits). Connect the Sensor Board to
          highlight stop zones when a switch closes.
        </p>
      </div>
    );
  }

  if (!hardwareMotorConnected && !simMotorConnected) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="text-muted-foreground text-xs font-medium">Cart on rail (twin)</span>
      <div className="flex flex-col gap-3">
        <RailTrack
          legLabel="Hardware"
          connected={hardwareMotorConnected}
          pos={motor.data?.positionCm}
          travelLimits={motor.data?.travelLimits}
          limitLeft={sensor.data?.limitLeftPressed ?? false}
          limitRight={sensor.data?.limitRightPressed ?? false}
          sensorConnected={sensor.data?.connected ?? false}
          cartClassName="bg-primary"
          cartTitle="Hardware cart position (cm)"
        />
        <RailTrack
          legLabel="Simulator"
          connected={simMotorConnected}
          pos={twinSim?.positionCm}
          travelLimits={twinSim?.travelLimits}
          limitLeft={twinSimSensor?.limitLeftPressed ?? false}
          limitRight={twinSimSensor?.limitRightPressed ?? false}
          sensorConnected={twinSimSensor?.connected ?? false}
          cartClassName="bg-sky-400 dark:bg-sky-300"
          cartTitle="Simulator cart position (cm)"
        />
      </div>
      <p className="text-muted-foreground text-[10px] leading-snug">
        Twin mode: each row uses its own motor travel limits and sensor limit switches. Hardware
        uses the physical Motor and Sensor boards; Simulator uses the simulation plant gRPC backends.
      </p>
    </div>
  );
});
