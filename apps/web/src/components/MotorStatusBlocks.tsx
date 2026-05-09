import { Link2, Link2Off } from "lucide-react";
import { CartRailVisualizer } from "@/components/CartRailVisualizer";
import { Button } from "@/components/ui/button";
import { useMotorSession } from "@/services/motorSession";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

/** Owns the polling status query so parent `App` does not re-render every refetch tick. */
function formatMeasuredCounts(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function MotorStatusBlocks() {
  const status = useMotorStatusQuery();
  const { connect, connected, busy, connectMotor, disconnectMotor } = useMotorSession();

  const measured = status.data?.measuredPosition;

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="text-muted-foreground text-sm font-medium">Status</span>
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
                  {formatMeasuredCounts(measured)}
                </span>{" "}
                <span className="font-sans font-normal">counts</span>
                {measured === undefined || !Number.isFinite(measured) ? (
                  <span className="ml-1 font-sans text-[10px] font-normal opacity-80">
                    (update motor-service / DLL)
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        {status.data?.connected ? <CartRailVisualizer /> : null}
        {status.data?.detail ? (
          <p className="text-muted-foreground text-xs leading-relaxed">{status.data.detail}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={busy}
              onClick={() => void connectMotor()}
            >
              <Link2 aria-hidden className="mr-2 h-4 w-4" />
              Connect motor
            </Button>
          ) : (
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
          )}
        </div>
        {connect.data && !connect.data.ok && connect.data.error ? (
          <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.data.error}</p>
        ) : null}
        {connect.error ? (
          <p className="text-destructive wrap-break-word whitespace-pre-wrap text-xs">{connect.error.message}</p>
        ) : null}
      </section>

      {status.data?.motor ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-muted-foreground text-sm font-medium">Motor (network report)</h2>
          <p className="text-muted-foreground text-xs">
            From Teknic <code className="text-foreground">IInfo</code> — same class of data as{" "}
            <code className="text-foreground">SCNetworkReport.exe</code> (read-only scan; connect
            required).
          </p>
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
        </section>
      ) : null}
    </>
  );
}
