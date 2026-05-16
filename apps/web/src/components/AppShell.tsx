import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { HomingControls } from "@/components/HomingControls";
import { JogControls } from "@/components/JogControls";
import { MotorStatusBlocks } from "@/components/MotorStatusBlocks";
import { PositionMoveControls } from "@/components/PositionMoveControls";
import { SensorLedCard } from "@/components/SensorLedCard";
import { BackendAutoConnect } from "@/components/BackendAutoConnect";
import { TuningPage } from "@/components/TuningPage";
import { cn } from "@/lib/utils";

export type AppPage = "control" | "tuning";

function ControlPage() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start lg:gap-5">
      <div className="flex flex-col gap-5">
        <MotorStatusBlocks />
        <JogControls />
      </div>
      <div className="flex flex-col gap-5">
        <HomingControls />
        <PositionMoveControls />
      </div>
      <SensorLedCard />
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

export function AppShell() {
  const [page, setPage] = useState<AppPage>("control");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BackendAutoConnect />
      <AppHeader />
      <div className="mx-auto max-w-7xl px-6 pt-4">
        <nav
          className="pointer-events-auto mb-4 flex w-fit gap-1 rounded-lg border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm"
          aria-label="Main sections"
        >
          <NavTab active={page === "control"} onClick={() => setPage("control")}>
            Control
          </NavTab>
          <NavTab active={page === "tuning"} onClick={() => setPage("tuning")}>
            Tuning
          </NavTab>
        </nav>
        {page === "control" ? <ControlPage /> : <TuningPage />}
      </div>
    </div>
  );
}
