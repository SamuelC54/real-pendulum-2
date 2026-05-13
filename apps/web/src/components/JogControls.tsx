import { memo } from "react";
import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { useAtomValue } from "jotai";
import { RailPendulumSchematic } from "@/components/RailPendulumSchematic";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMotorSession } from "@/services/motorSession";
import { holdingAtom, type JogHold } from "@/stores/jog";

/** Held look via aria-pressed — keeps variant="secondary" so CVA does not swap presets (avoids transition-colors flicker). */
const jogDirectionClasses =
  "flex-1 touch-manipulation select-none transition-none aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:z-10 aria-pressed:shadow-lg aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background";

type JogDirection = "left" | "right";

const JogDirectionButton = memo(function JogDirectionButton({
  direction,
  held,
  disabled,
  applyHold,
}: {
  direction: JogDirection;
  held: boolean;
  disabled: boolean;
  applyHold: (dir: JogHold) => void | Promise<void>;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className={cn(jogDirectionClasses)}
      disabled={disabled}
      aria-pressed={held}
      onPointerDown={(e) => {
        e.preventDefault();
        void applyHold(direction);
      }}
      onPointerUp={() => void applyHold(null)}
      onPointerLeave={(e) => {
        if (e.buttons === 0) void applyHold(null);
      }}
    >
      {direction === "left" ? (
        <>
          <ChevronLeft aria-hidden />
          Jog left
        </>
      ) : (
        <>
          Jog right
          <ChevronRight aria-hidden />
        </>
      )}
    </Button>
  );
});

export const JogControls = memo(function JogControls() {
  const { connected, applyHold, connect, disconnect, setVelocity, stop } = useMotorSession();
  const holding = useAtomValue(holdingAtom);

  const connectionBusy = connect.isPending || disconnect.isPending;
  const jogMutating = setVelocity.isPending || stop.isPending;
  // Do not disable jog/stop while a direction is held: setVelocity/stop pending would set
  // `busy` and briefly disable both arrows (pointer still down), which looks like the other
  // button "rerendering" / flashing. Still block when connect/disconnect runs or when idle and a
  // jog RPC is in flight (avoids double-starts).
  const disabled =
    !connected || connectionBusy || (jogMutating && holding === null);

  return (
    <section className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-md gap-4">
        <JogDirectionButton
          direction="left"
          held={holding === "left"}
          disabled={disabled}
          applyHold={applyHold}
        />
        <JogDirectionButton
          direction="right"
          held={holding === "right"}
          disabled={disabled}
          applyHold={applyHold}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="min-w-48"
        disabled={disabled}
        onClick={() => void applyHold(null)}
      >
        <OctagonAlert aria-hidden />
        Stop
      </Button>

      <RailPendulumSchematic />
    </section>
  );
});
