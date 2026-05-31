import { Link2, Link2Off } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CartRailVisualizer } from "@/components/CartRailVisualizer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMotorSession } from "@/services/motorSession";
import { useSimBackendAutoConnect } from "@/services/useSimBackendAutoConnect";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";
import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";

/** Owns the polling status query so parent `App` does not re-render every refetch tick. */
function formatPositionCm(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function MotorStatusBlocks() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const simAuto = useSimBackendAutoConnect();
  const status = useMotorStatusQuery();
  const { connect, connected, busy, connectMotor, disconnectMotor } = useMotorSession();

  const positionCm = status.data?.positionCm;

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
                {status.data?.connected ? (
                  <>
                    commanded{" "}
                    <span className="text-foreground font-semibold">
                      {status.data.commandedRpm.toFixed(1)}
                    </span>{" "}
                    rpm
                  </>
                ) : (
                  <span className="text-destructive">not connected</span>
                )}
              </span>
              {status.data?.connected ? (
                <span className="text-muted-foreground font-mono text-xs leading-tight">
                  position{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {formatPositionCm(positionCm)}
                  </span>{" "}
                  <span className="font-sans font-normal">cm</span>
                  {positionCm === undefined || !Number.isFinite(positionCm) ? (
                    <span className="ml-1 font-sans text-[10px] font-normal opacity-80">
                      (update motor-service / DLL)
                    </span>
                  ) : null}
                </span>
              ) : null}
              {status.data && "twinSimMotor" in status.data && status.data.twinSimMotor ? (
                <span className="text-muted-foreground block font-mono text-[10px] leading-tight">
                  Sim: {status.data.twinSimMotor.commandedRpm.toFixed(1)} rpm · pos{" "}
                  <span className="text-sky-900 dark:text-sky-200">
                    {formatPositionCm(status.data.twinSimMotor.positionCm)}
                  </span>{" "}
                  cm
                </span>
              ) : null}
            </div>
          </div>
          {status.data?.connected ||
          (status.data && "twinSimMotor" in status.data && status.data.twinSimMotor?.connected) ? (
            <CartRailVisualizer />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!connected && mode === "sim" ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {simAuto.pending
                  ? "Connecting to simulationulator…"
                  : (simAuto.lastError ??
                    "Simulator auto-connect — ensure simulation is running (npm run dev).")}
              </p>
            ) : null}
            {!connected && mode !== "sim" ? (
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
          {connect.data && "real" in connect.data ? (
            <>
              {!connect.data.real.ok && connect.data.real.error ? (
                <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">
                  {connect.data.real.error}
                </p>
              ) : null}
              {!connect.data.sim.ok && connect.data.sim.error ? (
                <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">
                  Sim motor: {connect.data.sim.error}
                </p>
              ) : null}
            </>
          ) : connect.data && !("real" in connect.data) && !connect.data.ok && connect.data.error ? (
            <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.data.error}</p>
          ) : null}
          {connect.error ? (
            <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.error.message}</p>
          ) : null}
        </TabsContent>

        <TabsContent value="network" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            From Teknic <code className="text-foreground">IInfo</code> — same class of data as{" "}
            <code className="text-foreground">SCNetworkReport.exe</code> (read-only scan; connect
            required).
          </p>
          {status.data?.motor ? (
            <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Node</dt>
              <dd className="font-mono">{status.data.motor.nodeIndex}</dd>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-mono">
                {status.data.motor.nodeTypeCode}{" "}
                <span className="text-muted-foreground">
                  ({status.data.motor.nodeTypeLabel || "—"})
                </span>
              </dd>
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="break-all font-mono text-xs">{status.data.motor.userId || "—"}</dd>
              <dt className="text-muted-foreground">Firmware</dt>
              <dd className="font-mono text-xs">{status.data.motor.firmwareVersion || "—"}</dd>
              <dt className="text-muted-foreground">Serial #</dt>
              <dd className="font-mono">{status.data.motor.serialNumber || "—"}</dd>
              <dt className="text-muted-foreground">Model</dt>
              <dd className="break-all font-mono text-xs">{status.data.motor.model || "—"}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Connect the Motor Board; node info appears here once the drive responds on the network.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
