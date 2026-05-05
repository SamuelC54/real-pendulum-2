import { Link2, Link2Off } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { JogControls } from "@/components/JogControls";
import { JOG_RPM } from "@/lib/jogMath";
import { useMotorSession } from "@/services/motorSession";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

export default function App() {
  const status = useMotorStatusQuery();
  const { connect, connected, busy, connectMotor, disconnectMotor, applyHold, stop } =
    useMotorSession();

  useEffect(() => {
    const onBlur = () => {
      void applyHold(null);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [applyHold]);

  useEffect(() => {
    return () => {
      void stop.mutate();
    };
  }, [stop.mutate]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Linear rail jog</h1>
          <p className="text-muted-foreground text-sm">
            Hold a direction to jog the cart ({JOG_RPM} rpm command). Release or leave the window to
            stop.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm font-medium">Status</span>
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
          </div>
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

        <JogControls />
      </div>
    </div>
  );
}
