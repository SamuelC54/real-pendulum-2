import { memo } from "react";
import {
  boundsFromTravelSwitchDisplays,
  motorCountsForDisplay,
} from "@/lib/motorPositionDisplay";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

/** Match `EncoderDial` default (600 P/R × 4). */
const COUNTS_PER_REV = 2400;
const MOD = (n: number, m: number) => ((n % m) + m) % m;

function formatMotor(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Linear rail (motor / Teknic display counts) plus a pendulum angle from the Sensor Board rotary
 * encoder ticks. Shown together so cart motion and pendulum rotation are visible at a glance.
 */
export const RailPendulumSchematic = memo(function RailPendulumSchematic() {
  const motor = useMotorStatusQuery();
  const sensor = trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.connected ? 80 : 1500),
  });

  const motorConnected = motor.data?.connected ?? false;
  const sensorConnected = sensor.data?.connected ?? false;
  const pos = motorCountsForDisplay(motor.data?.measuredPosition);
  const tl = motor.data?.travelLimits;
  const bounds = boundsFromTravelSwitchDisplays(tl?.left, tl?.right);
  const limitLeft = sensor.data?.limitLeftPressed ?? false;
  const limitRight = sensor.data?.limitRightPressed ?? false;
  const ticks = sensor.data?.encoderTicks ?? 0;

  const hasPosition = pos !== undefined && Number.isFinite(pos);
  const span = bounds ? bounds.max - bounds.min : 0;
  const hasScale = bounds != null && span > 1e-9;

  let pct = 50;
  if (bounds && hasPosition && hasScale) {
    const t = (pos - bounds.min) / span;
    pct = Math.max(3, Math.min(97, t * 100));
  }

  const rangeLabel =
    hasScale && bounds
      ? `${bounds.min.toFixed(0)} → ${bounds.max.toFixed(0)}`
      : null;

  const angleDeg = (MOD(ticks, COUNTS_PER_REV) / COUNTS_PER_REV) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const vbW = 400;
  /** Extra space above y=0 so the bob can swing upward (encoder near 180°) without clipping. */
  const vbTopPad = 80;
  const vbH = 132;
  const railY = 14;
  const railH = 22;
  const pivotY = railY + railH + 4;
  const rodLen = 78;
  const cartCx = (pct / 100) * vbW;
  /** Minus sin: quadrature direction vs SVG +x so real-world left matches screen left. */
  const bobX = cartCx - rodLen * Math.sin(angleRad);
  const bobY = pivotY + rodLen * Math.cos(angleRad);

  const ariaLabel = [
    motorConnected && hasPosition
      ? `Motor cart near ${pct.toFixed(0)} percent along rail, ${formatMotor(pos)} display counts`
      : "Motor rail position unavailable",
    sensorConnected
      ? `Pendulum encoder about ${angleDeg.toFixed(0)} degrees, ${ticks} ticks`
      : "Encoder disconnected",
  ].join(". ");

  return (
    <section
      className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-label={ariaLabel}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">Rail & pendulum</span>
        {rangeLabel ? (
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
            travel {rangeLabel} counts
          </span>
        ) : (
          <span className="text-muted-foreground text-[10px]">Record both limits to scale the rail</span>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] leading-tight">
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
          <div className="text-muted-foreground font-medium">Motor</div>
          <div className="font-mono text-foreground tabular-nums">
            {motorConnected ? `${formatMotor(pos)} cts` : "—"}
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
          <div className="text-muted-foreground font-medium">Encoder</div>
          <div className="font-mono text-foreground tabular-nums">
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

      <svg
        viewBox={`0 ${-vbTopPad} ${vbW} ${vbH + vbTopPad}`}
        className="aspect-[400/212] h-auto w-full text-foreground"
        role="img"
        aria-hidden
      >
        <title>{ariaLabel}</title>
        {/* Rail bed */}
        <rect
          x={0}
          y={railY + railH - 2}
          width={vbW}
          height={4}
          rx={2}
          className="fill-muted-foreground/25"
        />
        {/* Limit zones */}
        <rect
          x={0}
          y={railY}
          width={vbW * 0.1}
          height={railH}
          rx={4}
          className={cn(
            "transition-colors",
            limitLeft && sensorConnected ? "fill-amber-500/35" : "fill-muted/50",
          )}
        />
        <rect
          x={vbW * 0.9}
          y={railY}
          width={vbW * 0.1}
          height={railH}
          rx={4}
          className={cn(
            "transition-colors",
            limitRight && sensorConnected ? "fill-amber-500/35" : "fill-muted/50",
          )}
        />
        <rect
          x={vbW * 0.1}
          y={railY}
          width={vbW * 0.8}
          height={railH}
          rx={0}
          className="fill-muted/25"
        />
        {/* Cart */}
        <g className="transition-transform duration-150 ease-out">
          <rect
            x={cartCx - 14}
            y={railY + 3}
            width={28}
            height={railH - 6}
            rx={4}
            className={cn(
              "stroke-2",
              motorConnected && hasPosition
                ? "fill-primary stroke-primary"
                : "fill-muted-foreground/30 stroke-muted-foreground/40",
            )}
          />
        </g>
        {/* Pendulum */}
        <line
          x1={cartCx}
          y1={pivotY}
          x2={bobX}
          y2={bobY}
          strokeWidth={3}
          strokeLinecap="round"
          className={cn(
            "stroke-current",
            sensorConnected ? "text-primary/90" : "text-muted-foreground/40",
          )}
        />
        <circle
          cx={bobX}
          cy={bobY}
          r={9}
          className={cn(
            "stroke-2 stroke-background",
            sensorConnected ? "fill-primary" : "fill-muted-foreground/35",
          )}
        />
        <circle
          cx={cartCx}
          cy={pivotY}
          r={3.5}
          className="fill-muted stroke-2 stroke-border"
        />
        <text x={vbW * 0.05} y={railY - 2} className="fill-muted-foreground font-mono text-[11px]">
          L
        </text>
        <text
          x={vbW * 0.95}
          y={railY - 2}
          textAnchor="end"
          className="fill-muted-foreground font-mono text-[11px]"
        >
          R
        </text>
      </svg>

      <p className="text-muted-foreground mt-2 text-[10px] leading-snug">
        Cart follows Teknic measured position (display counts: left negative, right positive). Rod and
        bob follow the quadrature encoder on the Sensor Board (same phase as the dial card).
      </p>
    </section>
  );
});
