import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { HomingControls } from "@/components/HomingControls";
import { LimitSwitchModeBanner } from "@/components/LimitSwitchModeBanner";
import { JogControls } from "@/components/JogControls";
import { MotorStatusBlocks } from "@/components/MotorStatusBlocks";
import { PositionMoveControls } from "@/components/PositionMoveControls";
import { SensorLedCard } from "@/components/SensorLedCard";
import { BackendAutoConnect } from "@/components/BackendAutoConnect";
import { KeyboardJogListener } from "@/components/KeyboardJogListener";
import { DigitalTwinPage } from "@/components/DigitalTwinPage";
import { ControllersPage } from "@/components/ControllersPage";
import { ContainersPage } from "@/components/ContainersPage";
import { SystemArchitecturePage } from "@/components/SystemArchitecturePage";
import { TraceIdBar } from "@/components/TraceIdBar";
import { cn } from "@/lib/utils";

export type AppPage =
  | "control"
  | "controllers"
  | "digital-twin"
  | "containers"
  | "architecture";

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

export function AppShell() {
  const [page, setPage] = useState<AppPage>("control");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BackendAutoConnect />
      <KeyboardJogListener />
      <AppHeader
        nav={
          <nav
            className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1 shadow-sm"
            aria-label="Main sections"
          >
            <NavTab active={page === "control"} onClick={() => setPage("control")}>
              Control
            </NavTab>
            <NavTab active={page === "controllers"} onClick={() => setPage("controllers")}>
              Controllers
            </NavTab>
            <NavTab active={page === "digital-twin"} onClick={() => setPage("digital-twin")}>
              Digital twin
            </NavTab>
            <NavTab active={page === "containers"} onClick={() => setPage("containers")}>
              Containers
            </NavTab>
            <NavTab active={page === "architecture"} onClick={() => setPage("architecture")}>
              System architecture
            </NavTab>
          </nav>
        }
      />
      <main
        className={cn(
          "mx-auto px-6 py-4",
          page === "digital-twin" || page === "containers" || page === "architecture"
            ? "max-w-[96rem]"
            : "max-w-7xl",
        )}
      >
        <LimitSwitchModeBanner />
        <div className={page === "control" ? undefined : "hidden"} aria-hidden={page !== "control"}>
          <ControlPage />
        </div>
        <div className={page === "controllers" ? undefined : "hidden"} aria-hidden={page !== "controllers"}>
          <ControllersPage />
        </div>
        <div
          className={page === "digital-twin" ? undefined : "hidden"}
          aria-hidden={page !== "digital-twin"}
        >
          <DigitalTwinPage />
        </div>
        <div
          className={page === "containers" ? undefined : "hidden"}
          aria-hidden={page !== "containers"}
        >
          <ContainersPage />
        </div>
        <div
          className={page === "architecture" ? undefined : "hidden"}
          aria-hidden={page !== "architecture"}
        >
          <SystemArchitecturePage />
        </div>
      </main>
      <TraceIdBar />
    </div>
  );
}
