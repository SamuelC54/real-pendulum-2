import { memo } from "react";
import { useAtomValue } from "jotai";
import { boundsFromTravelLimitsCm } from "@/lib/railPositionCm";
import { cn } from "@/lib/utils";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";

/** Match `EncoderDial` default (600 P/R × 4). */
const COUNTS_PER_REV = 2400;
const MOD = (n: number, m: number) => ((n % m) + m) % m;

const VB_W = 400;
const VB_TOP_PAD = 80;
const VB_H = 132;
const RAIL_Y = 14;
const RAIL_H = 22;
const ROD_LEN = 78;

function formatMotor(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type LegVariant = "hardware" | "simulator";

type RailPendulumLegProps = {
  legLabel: string;
  variant: LegVariant;
  motorConnected: boolean;
  sensorConnected: boolean;
  pos: number | undefined;
  travelLimits: { leftCm: number | null; rightCm: number | null } | undefined;
  limitLeft: boolean;
  limitRight: boolean;
  ticks: number;
};

function RailPendulumLeg({
  legLabel,
  variant,
  motorConnected,
  sensorConnected,
  pos,
  travelLimits,
  limitLeft,
  limitRight,
  ticks,
}: RailPendulumLegProps) {
  const isSim = variant === "simulator";
  const bounds = boundsFromTravelLimitsCm(travelLimits?.leftCm, travelLimits?.rightCm);
  const hasPosition = pos !== undefined && Number.isFinite(pos);
  const span = bounds ? bounds.max - bounds.min : 0;
  const hasScale = bounds != null && span > 1e-9;

  let pct = 50;
  if (bounds && hasPosition && hasScale) {
    const t = (pos - bounds.min) / span;
    pct = Math.max(3, Math.min(97, t * 100));
  }

  const rangeLabel =
    hasScale && bounds ? `${bounds.min.toFixed(0)} → ${bounds.max.toFixed(0)}` : null;

  const angleDeg = (MOD(ticks, COUNTS_PER_REV) / COUNTS_PER_REV) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const pivotY = RAIL_Y + RAIL_H + 4;
  const cartCx = (pct / 100) * VB_W;
  const bobX = cartCx - ROD_LEN * Math.sin(angleRad);
  const bobY = pivotY + ROD_LEN * Math.cos(angleRad);

  const ariaLabel = [
    `${legLabel}: `,
    motorConnected && hasPosition
      ? `cart near ${pct.toFixed(0)} percent along rail, ${formatMotor(pos)} cm`
      : "motor rail position unavailable",
    sensorConnected
      ? `pendulum encoder about ${angleDeg.toFixed(0)} degrees, ${ticks} ticks`
      : "encoder disconnected",
  ].join("");

  const statCardClass = isSim
    ? "rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-1.5 dark:bg-sky-500/15"
    : "rounded-md border border-border bg-muted/30 px-2 py-1.5";
  const statValueClass = isSim ? "font-mono text-sky-950 tabular-nums dark:text-sky-100" : "font-mono text-foreground tabular-nums";
  const cartActiveClass = isSim
    ? "fill-sky-500 stroke-sky-800 dark:stroke-sky-200"
    : "fill-primary stroke-primary";
  const pendulumActiveClass = isSim ? "text-sky-600 dark:text-sky-300" : "text-primary/90";
  const bobActiveClass = isSim ? "fill-sky-500" : "fill-primary";

  return (
    <section className="flex flex-col gap-2" aria-label={ariaLabel}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{legLabel}</span>
        {rangeLabel ? (
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
            travel {rangeLabel} cm
          </span>
        ) : motorConnected || sensorConnected ? (
          <span className="text-muted-foreground text-[10px]">Record both limits to scale the rail</span>
        ) : (
          <span className="text-muted-foreground text-[10px]">Not connected</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] leading-tight">
        <div className={statCardClass}>
          <div className="text-muted-foreground font-medium">Motor</div>
          <div className={statValueClass}>
            {motorConnected ? `${formatMotor(pos)} cm` : "—"}
          </div>
        </div>
        <div className={statCardClass}>
          <div className="text-muted-foreground font-medium">Encoder</div>
          <div className={statValueClass}>
            {sensorConnected ? (
              <>
                {ticks} ticks
                <span className="text-muted-foreground ml-1 font-sans text-[10px]">
                  ({angleDeg.toFixed(0)}°)
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 ${-VB_TOP_PAD} ${VB_W} ${VB_H + VB_TOP_PAD}`}
          className={cn(
            "aspect-[400/212] h-auto w-full text-foreground",
            !motorConnected && !sensorConnected && "opacity-50",
          )}
          role="img"
          aria-hidden
        >
          <title>{ariaLabel}</title>
          <rect
            x={0}
            y={RAIL_Y + RAIL_H - 2}
            width={VB_W}
            height={4}
            rx={2}
            className="fill-muted-foreground/25"
          />
          <rect
            x={0}
            y={RAIL_Y}
            width={VB_W * 0.1}
            height={RAIL_H}
            rx={4}
            className={cn(
              "transition-colors",
              limitLeft && sensorConnected ? "fill-amber-500/35" : "fill-muted/50",
            )}
          />
          <rect
            x={VB_W * 0.9}
            y={RAIL_Y}
            width={VB_W * 0.1}
            height={RAIL_H}
            rx={4}
            className={cn(
              "transition-colors",
              limitRight && sensorConnected ? "fill-amber-500/35" : "fill-muted/50",
            )}
          />
          <rect x={VB_W * 0.1} y={RAIL_Y} width={VB_W * 0.8} height={RAIL_H} className="fill-muted/25" />
          <g className="transition-transform duration-150 ease-out">
            <rect
              x={cartCx - 14}
              y={RAIL_Y + 3}
              width={28}
              height={RAIL_H - 6}
              rx={4}
              className={cn(
                "stroke-2",
                motorConnected && hasPosition
                  ? cartActiveClass
                  : "fill-muted-foreground/30 stroke-muted-foreground/40",
              )}
            />
          </g>
          <line
            x1={cartCx}
            y1={pivotY}
            x2={bobX}
            y2={bobY}
            strokeWidth={3}
            strokeLinecap="round"
            className={cn(
              "stroke-current",
              sensorConnected ? pendulumActiveClass : "text-muted-foreground/40",
            )}
          />
          <circle
            cx={bobX}
            cy={bobY}
            r={9}
            className={cn(
              "stroke-2 stroke-background",
              sensorConnected ? bobActiveClass : "fill-muted-foreground/35",
            )}
          />
          <circle cx={cartCx} cy={pivotY} r={3.5} className="fill-muted stroke-2 stroke-border" />
          <text x={VB_W * 0.05} y={RAIL_Y - 2} className="fill-muted-foreground font-mono text-[11px]">
            L
          </text>
          <text
            x={VB_W * 0.95}
            y={RAIL_Y - 2}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[11px]"
          >
            R
          </text>
        </svg>
        {!motorConnected && !sensorConnected ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/60 text-muted-foreground text-xs">
            Not connected
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Linear rail (motor position in cm) plus a pendulum angle from the Sensor Board rotary
 * encoder ticks.
 */
export const RailPendulumSchematic = memo(function RailPendulumSchematic() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const motor = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  const twinSim =
    motor.data && "twinSimMotor" in motor.data ? motor.data.twinSimMotor : undefined;
  const twinSimSensor =
    sensor.data && "twinSimSensor" in sensor.data ? sensor.data.twinSimSensor : undefined;

  if (mode === "twin") {
    return (
      <div className="w-full max-w-md border-t border-border pt-4">
        <span className="text-muted-foreground mb-3 block text-xs font-medium">Rail & pendulum (twin)</span>
        <div className="flex flex-col gap-6">
          <RailPendulumLeg
            legLabel="Hardware"
            variant="hardware"
            motorConnected={motor.data?.connected ?? false}
            sensorConnected={sensor.data?.connected ?? false}
            pos={motor.data?.positionCm}
            travelLimits={motor.data?.travelLimits}
            limitLeft={sensor.data?.limitLeftPressed ?? false}
            limitRight={sensor.data?.limitRightPressed ?? false}
            ticks={sensor.data?.encoderTicks ?? 0}
          />
          <RailPendulumLeg
            legLabel="Simulator"
            variant="simulator"
            motorConnected={twinSim?.connected ?? false}
            sensorConnected={twinSimSensor?.connected ?? false}
            pos={twinSim?.positionCm}
            travelLimits={twinSim?.travelLimits}
            limitLeft={twinSimSensor?.limitLeftPressed ?? false}
            limitRight={twinSimSensor?.limitRightPressed ?? false}
            ticks={twinSimSensor?.encoderTicks ?? 0}
          />
        </div>
        <p className="text-muted-foreground mt-3 text-[10px] leading-snug">
          Twin mode: hardware and simulator schematics. Open the Digital Twin tab for the large 3D
          view.
        </p>
      </div>
    );
  }

  const isSim = mode === "sim";

  return (
    <div className="w-full max-w-md border-t border-border pt-4">
      <RailPendulumLeg
        legLabel={isSim ? "Simulator" : "Rail & pendulum"}
        variant={isSim ? "simulator" : "hardware"}
        motorConnected={motor.data?.connected ?? false}
        sensorConnected={sensor.data?.connected ?? false}
        pos={motor.data?.positionCm}
        travelLimits={motor.data?.travelLimits}
        limitLeft={sensor.data?.limitLeftPressed ?? false}
        limitRight={sensor.data?.limitRightPressed ?? false}
        ticks={sensor.data?.encoderTicks ?? 0}
      />
      <p className="text-muted-foreground mt-2 text-[10px] leading-snug">
        {isSim
          ? "2D schematic for the simulator. Use the Digital Twin tab for the large 3D view."
          : "Cart follows Teknic measured position (cm: left negative, right positive). Rod and bob follow the quadrature encoder on the Sensor Board (same phase as the dial card)."}
      </p>
    </div>
  );
});
