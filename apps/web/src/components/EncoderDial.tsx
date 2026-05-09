import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Visual dial for quadrature encoder ticks: angle within one revolution + summary stats.
 * Default **countsPerRev** matches a typical 600 P/R encoder with x4 decoding (2400 edges/rev).
 */
const MOD = (n: number, m: number) => ((n % m) + m) % m;

type EncoderDialProps = {
  ticks: number;
  /** Quadrature counts per full rotation (600 P/R × 4 = 2400). */
  countsPerRev?: number;
  connected: boolean;
  /** Zero tick counter on the Arduino (requires firmware with RESET_ENC). */
  onReset?: () => void;
  resetBusy?: boolean;
};

export function EncoderDial({
  ticks,
  countsPerRev = 2400,
  connected,
  onReset,
  resetBusy = false,
}: EncoderDialProps) {
  const cpr = countsPerRev > 0 ? countsPerRev : 2400;
  const angleDeg = (MOD(ticks, cpr) / cpr) * 360;
  const turns = ticks / cpr;

  if (!connected) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm leading-relaxed">
        <p>Connect the Arduino to see encoder rotation.</p>
        <p className="mt-2 text-xs">
          Encoder wiring:{" "}
          <span className="text-neutral-500 dark:text-neutral-300">D2: white wire</span>{" "}
          ·{" "}
          <span className="text-green-600 dark:text-green-400">D3: green wire</span>
        </p>
      </div>
    );
  }

  const needleRotation = angleDeg - 90;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-muted-foreground text-center text-xs leading-relaxed">
        <p className="font-medium">Rotary encoder (pins D2 / D3)</p>
        <p className="mt-1">
          <span className="text-neutral-500 dark:text-neutral-300">D2: white wire</span>{" "}
          ·{" "}
          <span className="text-green-600 dark:text-green-400">D3: green wire</span>
        </p>
      </div>
      <svg
        viewBox="0 0 120 120"
        className="h-40 w-40 text-primary"
        aria-label={`Encoder angle ${angleDeg.toFixed(1)} degrees, ${ticks} ticks`}
        role="img"
      >
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-30"
        />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const x1 = 60 + 46 * Math.cos(rad);
          const y1 = 60 + 46 * Math.sin(rad);
          const x2 = 60 + 52 * Math.cos(rad);
          const y2 = 60 + 52 * Math.sin(rad);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-40"
            />
          );
        })}
        <g transform={`rotate(${needleRotation} 60 60)`}>
          <line
            x1="60"
            y1="60"
            x2="60"
            y2="18"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <circle cx="60" cy="60" r="5" fill="currentColor" />
      </svg>
      <dl className="grid w-full max-w-xs grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">Angle (this rev)</dt>
        <dd className="text-right">{angleDeg.toFixed(1)}°</dd>
        <dt className="text-muted-foreground">Ticks</dt>
        <dd className="text-right">{ticks}</dd>
        <dt className="text-muted-foreground">Turns</dt>
        <dd className="text-right">{turns.toFixed(3)}</dd>
        <dt className="text-muted-foreground col-span-2 pt-1 text-[10px] font-sans normal-case">
          Assumes {cpr} counts/rev (600 P/R × 4). Swap A/B if rotation is inverted.
        </dt>
      </dl>
      {onReset ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          disabled={resetBusy}
          onClick={() => onReset()}
        >
          <RotateCcw
            aria-hidden
            className={resetBusy ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"}
          />
          Reset encoder
        </Button>
      ) : null}
    </div>
  );
}
