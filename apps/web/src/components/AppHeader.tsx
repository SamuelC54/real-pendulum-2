import { BackendModeControl } from "@/components/BackendModeControl";
import {
  useMotorStatusConnected,
  useSensorStatusConnected,
} from "@/services/useMotorStatusQuery";
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums",
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
    <header className="pointer-events-none fixed top-3 right-4 z-50 max-w-[min(100vw-2rem,22rem)] sm:top-4 sm:right-6">
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <BackendModeControl />
        <div
          className="flex flex-wrap justify-end gap-1.5"
          aria-label="Hardware connection status"
        >
          <ConnectionBadge label="Motor Board" connected={motorOn} />
          <ConnectionBadge label="Sensor Board" connected={sensorOn} />
        </div>
      </div>
      <span className="sr-only">Linear rail jog — hardware connection status</span>
    </header>
  );
}
