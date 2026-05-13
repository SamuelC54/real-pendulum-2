import { AppHeader } from "@/components/AppHeader";
import { HomingControls } from "@/components/HomingControls";
import { JogControls } from "@/components/JogControls";
import { MotorStatusBlocks } from "@/components/MotorStatusBlocks";
import { PositionMoveControls } from "@/components/PositionMoveControls";
import { SensorLedCard } from "@/components/SensorLedCard";

export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />
      <div className="mx-auto flex max-w-7xl flex-col px-6 pt-4 ">
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
      </div>
    </div>
  );
}
