import { useAtomValue } from "jotai";
import { CartPendulumViewer } from "@/components/CartPendulumViewer";
import { JogControls } from "@/components/JogControls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimPlantTelemetry } from "@/hooks/useSimPlantTelemetry";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";

function formatCm(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function DigitalTwinPage() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const plant = useSimPlantTelemetry();

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Digital twin</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-snug">
            Jog the coupled simulator; the 3D view mirrors physics-sim poses (motor cm + encoder).
            Use backend mode <strong className="text-foreground font-medium">Sim</strong> or{" "}
            <strong className="text-foreground font-medium">Twin</strong>.
          </p>
        </div>
        {plant.supportsTwinView ? (
          <dl className="flex flex-wrap gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Cart</dt>
              <dd className="font-mono tabular-nums">{formatCm(plant.positionCm)} cm</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Encoder</dt>
              <dd className="font-mono tabular-nums">{plant.encoderTicks} ticks</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(17rem,22rem)_1fr] lg:items-stretch">
        <JogControls className="h-fit lg:sticky lg:top-4" />

        <Card className="flex min-h-[min(72vh,42rem)] flex-col overflow-hidden lg:min-h-[min(78vh,48rem)]">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Simulator (3D)</CardTitle>
            <CardDescription>
              {mode === "twin"
                ? "Coupled-sim plant — physics runs in MuJoCo on the backend."
                : mode === "sim"
                  ? "Sim motor + sensor — poses from physics-sim."
                  : "Switch to Sim or Twin in the header to drive the digital twin."}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative flex min-h-0 flex-1 flex-col p-3 pt-3">
            <CartPendulumViewer
              variant="fill"
              positionCm={plant.positionCm}
              encoderTicks={plant.encoderTicks}
              connected={plant.connected}
            />
            {!plant.supportsTwinView ? (
              <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-md bg-background/80 px-4 text-center text-sm text-muted-foreground">
                Digital twin view needs Sim or Twin backend mode.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
