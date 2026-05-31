import { Link2, Link2Off } from "lucide-react";
import { useAtomValue } from "jotai";
import { Card } from "@/components/ui/card";
import { CartRailVisualizer } from "@/components/CartRailVisualizer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cmPerSecToRpm } from "@/lib/jogMath";
import { useMotorSession } from "@/services/motorSession";
import { useSimulationBackendAutoConnect } from "@/services/useSimulationBackendAutoConnect";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";
import { controlBackendModeAtom } from "@/stores/controlBackendMode";

function formatPositionCm(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function MotorStatusBlocks() {
  const mode = useAtomValue(controlBackendModeAtom);
  const simAuto = useSimulationBackendAutoConnect();
  const status = useMotorStatusQuery();
  const { connect, connected, busy, connectMotor, disconnectMotor } = useMotorSession();

  const state = status.data;
  const twinSim = state && "twinSim" in state ? state.twinSim : undefined;
  const cartConnected = state?.connection.cart ?? false;
  const positionCm = state?.cart.positionCm;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <Tabs defaultValue="live" className="w-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="text-muted-foreground text-sm font-medium">Motor Board</span>
          <TabsList aria-label="Motor Board sections">
            <TabsTrigger value="live">Live status</TabsTrigger>
            <TabsTrigger value="network">Network report</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="live" className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-end gap-3">
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="font-mono text-sm">
                {cartConnected ? (
                  <>
                    commanded{" "}
                    <span className="text-foreground font-semibold">
                      {cmPerSecToRpm(state!.cart.commandedCmPerSec).toFixed(1)}
                    </span>{" "}
                    rpm
                  </>
                ) : (
                  <span className="text-destructive">not connected</span>
                )}
              </span>
              {cartConnected ? (
                <span className="text-muted-foreground font-mono text-xs leading-tight">
                  position{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {formatPositionCm(positionCm)}
                  </span>{" "}
                  <span className="font-sans font-normal">cm</span>
                  {positionCm === undefined || positionCm === null || !Number.isFinite(positionCm) ? (
                    <span className="ml-1 font-sans text-[10px] font-normal opacity-80">
                      (update physical-motor-service / DLL)
                    </span>
                  ) : null}
                </span>
              ) : null}
              {twinSim ? (
                <span className="text-muted-foreground block font-mono text-[10px] leading-tight">
                  Sim: {cmPerSecToRpm(twinSim.cart.commandedCmPerSec).toFixed(1)} rpm · pos{" "}
                  <span className="text-sky-900 dark:text-sky-200">
                    {formatPositionCm(twinSim.cart.positionCm)}
                  </span>{" "}
                  cm
                </span>
              ) : null}
            </div>
          </div>
          {cartConnected || twinSim?.connection.cart ? <CartRailVisualizer /> : null}
          <div className="flex flex-wrap gap-2">
            {!connected && mode === "simulation" ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {simAuto.pending
                  ? "Connecting to simulationulator…"
                  : (simAuto.lastError ??
                    "Simulator auto-connect — run npm run dev (Docker stack).")}
              </p>
            ) : null}
            {!connected && mode !== "simulation" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={busy}
                onClick={() => void connectMotor()}
              >
                <Link2 aria-hidden className="mr-2 h-4 w-4" />
                Connect Motor Board
              </Button>
            ) : null}
            {connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void disconnectMotor()}
              >
                <Link2Off aria-hidden className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            ) : null}
          </div>
          {connect.data && !connect.data.ok && connect.data.error ? (
            <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.data.error}</p>
          ) : null}
          {connect.error ? (
            <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.error.message}</p>
          ) : null}
        </TabsContent>

        <TabsContent value="network" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Teknic node scan data is not part of <code className="text-foreground">RailMachineState</code>.
            Use ClearView / SCNetworkReport on the bench for drive network details.
          </p>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
