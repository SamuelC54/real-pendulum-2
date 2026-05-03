import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMotorSession } from "@/services/motorSession";
import { holdingAtom } from "@/stores/jog";

const jogHeldVisual =
  "z-10 shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background motion-safe:scale-[1.02]";

export function JogControls() {
  const { connected, busy, applyHold } = useMotorSession();
  const holding = useAtomValue(holdingAtom);

  const disabled = busy || !connected;

  return (
    <section className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-md gap-4">
        <Button
          type="button"
          variant={holding === "left" ? "default" : "secondary"}
          size="lg"
          className={cn(
            "flex-1 touch-manipulation select-none transition-[color,box-shadow,transform,ring] duration-200",
            holding === "left" && jogHeldVisual,
          )}
          disabled={disabled}
          aria-pressed={holding === "left"}
          onPointerDown={(e) => {
            e.preventDefault();
            void applyHold("left");
          }}
          onPointerUp={() => void applyHold(null)}
          onPointerLeave={(e) => {
            if (e.buttons === 0) void applyHold(null);
          }}
        >
          <ChevronLeft aria-hidden />
          Jog left
        </Button>
        <Button
          type="button"
          variant={holding === "right" ? "default" : "secondary"}
          size="lg"
          className={cn(
            "flex-1 touch-manipulation select-none transition-[color,box-shadow,transform,ring] duration-200",
            holding === "right" && jogHeldVisual,
          )}
          disabled={disabled}
          aria-pressed={holding === "right"}
          onPointerDown={(e) => {
            e.preventDefault();
            void applyHold("right");
          }}
          onPointerUp={() => void applyHold(null)}
          onPointerLeave={(e) => {
            if (e.buttons === 0) void applyHold(null);
          }}
        >
          Jog right
          <ChevronRight aria-hidden />
        </Button>
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
    </section>
  );
}
