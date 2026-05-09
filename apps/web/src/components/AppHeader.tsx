import {
  useMotorStatusConnected,
  useSensorStatusConnected,
} from "@/services/useMotorStatusQuery";
import { JOG_RPM } from "@/lib/jogMath";
import { cn } from "@/lib/utils";

function ConnectionBadge({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tabular-nums",
        connected
          ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/35",
        )}
        aria-hidden
      />
      <span>{label}</span>
      <span className="text-[11px] opacity-90">
        {connected ? "Connected" : "Disconnected"}
      </span>
    </span>
  );
}

export function AppHeader() {
  const motor = useMotorStatusConnected();
  const sensor = useSensorStatusConnected();
  const motorOn = motor.data ?? false;
  const sensorOn = sensor.data ?? false;

  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Linear rail jog</h1>
          <p className="text-muted-foreground text-sm">
            Hold a direction to jog the cart ({JOG_RPM} rpm command). Release to stop.
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 lg:pt-0.5"
          aria-label="Hardware connection status"
        >
          <ConnectionBadge label="Motor Board" connected={motorOn} />
          <ConnectionBadge label="Sensor Board" connected={sensorOn} />
        </div>
      </div>
    </header>
  );
}
