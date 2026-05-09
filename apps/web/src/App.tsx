import { JogControls } from "@/components/JogControls";
import { MotorStatusBlocks } from "@/components/MotorStatusBlocks";
import { SensorLedCard } from "@/components/SensorLedCard";
import { JOG_RPM } from "@/lib/jogMath";

export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Linear rail jog</h1>
          <p className="text-muted-foreground text-sm">
            Hold a direction to jog the cart ({JOG_RPM} rpm command). Release to stop.
          </p>
        </header>

        <MotorStatusBlocks />

        <SensorLedCard />

        <JogControls />
      </div>
    </div>
  );
}
