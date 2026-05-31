import type { ReactNode } from "react";
import { useAtomValue } from "jotai";
import { BackendModeControl } from "@/components/BackendModeControl";
import {
  useMotorStatusConnected,
  useSensorStatusConnected,
  useTwinLinkageStatus,
} from "@/services/useMotorStatusQuery";
import { controlBackendModeAtom } from "@/stores/controlBackendMode";
import { cn } from "@/lib/utils";

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/35",
      )}
      aria-hidden
    />
  );
}

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
      <StatusDot connected={connected} />
      <span>{label}</span>
      <span className="text-[11px] opacity-90">
        {connected ? "Connected" : "Disconnected"}
      </span>
    </span>
  );
}

function TwinBoardIndicator({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${label} ${connected ? "connected" : "disconnected"}`}
    >
      <StatusDot connected={connected} />
      <span>{label}</span>
    </span>
  );
}

function TwinLegRow({
  legLabel,
  motor,
  sensor,
}: {
  legLabel: string;
  motor: boolean;
  sensor: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-muted-foreground">{legLabel}</span>
      <TwinBoardIndicator label="Motor" connected={motor} />
      <TwinBoardIndicator label="Sensor" connected={sensor} />
    </span>
  );
}

function TwinLinkageBadge({
  motorPhysical,
  sensorPhysical,
  motorSim,
  sensorSim,
}: {
  motorPhysical: boolean;
  sensorPhysical: boolean;
  motorSim: boolean;
  sensorSim: boolean;
}) {
  const allOn = motorPhysical && sensorPhysical && motorSim && sensorSim;
  const anyOn = motorPhysical || sensorPhysical || motorSim || sensorSim;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
        allOn
          ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
          : anyOn
            ? "border-amber-500/45 bg-amber-500/10 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-200"
            : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      <span className="font-semibold">Twin</span>
      <TwinLegRow legLabel="Physical" motor={motorPhysical} sensor={sensorPhysical} />
      <TwinLegRow legLabel="Simulation" motor={motorSim} sensor={sensorSim} />
    </span>
  );
}

function StandardConnectionBadges() {
  const motorOn = useMotorStatusConnected().data ?? false;
  const sensorOn = useSensorStatusConnected().data ?? false;
  return (
    <>
      <ConnectionBadge label="Motor Board" connected={motorOn} />
      <ConnectionBadge label="Sensor Board" connected={sensorOn} />
    </>
  );
}

function TwinConnectionBadge() {
  const linkage = useTwinLinkageStatus();
  return <TwinLinkageBadge {...linkage} />;
}

function ConnectionBadges() {
  const mode = useAtomValue(controlBackendModeAtom);
  return mode === "twin" ? <TwinConnectionBadge /> : <StandardConnectionBadges />;
}

export function AppHeader({ nav }: { nav: ReactNode }) {
  const mode = useAtomValue(controlBackendModeAtom);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 shrink-0">{nav}</div>
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:justify-end"
          aria-label={mode === "twin" ? "Twin physical and simulation connection status" : "Physical connection status"}
        >
          <BackendModeControl />
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <ConnectionBadges />
          </div>
        </div>
      </div>
      <span className="sr-only">Linear rail jog — connection status</span>
    </header>
  );
}
