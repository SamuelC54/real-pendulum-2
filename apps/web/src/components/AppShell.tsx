import { useAtomValue } from "jotai";
import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { HomingControls } from "@/components/HomingControls";
import { JogControls } from "@/components/JogControls";
import { MotorStatusBlocks } from "@/components/MotorStatusBlocks";
import { PositionMoveControls } from "@/components/PositionMoveControls";
import { SensorLedCard } from "@/components/SensorLedCard";
import { BackendAutoConnect } from "@/components/BackendAutoConnect";
import { KeyboardJogListener } from "@/components/KeyboardJogListener";
import { TuningPage } from "@/components/TuningPage";
import { TuningRecorder } from "@/components/TuningRecorder";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { tuningRecordingAtom } from "@/stores/tuningSession";
import { cn } from "@/lib/utils";

export type AppPage = "control" | "tuning";

function ControlPage() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start lg:gap-5">
      <JogControls />
      <div className="flex flex-col gap-5">
        <HomingControls />
        <PositionMoveControls />
      </div>
      <div className="flex flex-col gap-5">
        <MotorStatusBlocks />
        <SensorLedCard />
      </div>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TuningRecordingBanner() {
  const recording = useAtomValue(tuningRecordingAtom);
  const mode = useAtomValue(grpcBackendModeAtom);
  if (!recording || mode !== "twin") return null;
  return (
    <p
      className="mb-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200"
      role="status"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
      Twin tuning recording — switch back to Tuning to stop or export.
    </p>
  );
}

export function AppShell() {
  const [page, setPage] = useState<AppPage>("control");
  const recording = useAtomValue(tuningRecordingAtom);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BackendAutoConnect />
      <KeyboardJogListener />
      <TuningRecorder />
      <AppHeader
        nav={
          <nav
            className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1 shadow-sm"
            aria-label="Main sections"
          >
            <NavTab active={page === "control"} onClick={() => setPage("control")}>
              Control
            </NavTab>
            <NavTab active={page === "tuning"} onClick={() => setPage("tuning")}>
              Tuning
              {recording ? (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
              ) : null}
            </NavTab>
          </nav>
        }
      />
      <main className="mx-auto max-w-7xl px-6 py-4">
        <TuningRecordingBanner />
        <div className={page === "control" ? undefined : "hidden"} aria-hidden={page !== "control"}>
          <ControlPage />
        </div>
        <div className={page === "tuning" ? undefined : "hidden"} aria-hidden={page !== "tuning"}>
          <TuningPage />
        </div>
      </main>
    </div>
  );
}
