import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export type JogControlsProps = {
  busy: boolean;
  connected: boolean;
  holding: "left" | "right" | null;
  applyHold: (dir: "left" | "right" | null) => void | Promise<void>;
};

export function JogControls({ busy, connected, holding, applyHold }: JogControlsProps) {
  return (
    <section className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-md gap-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="flex-1 touch-manipulation select-none"
          disabled={busy || !connected}
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
          variant="secondary"
          size="lg"
          className="flex-1 touch-manipulation select-none"
          disabled={busy || !connected}
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
        className="min-w-[12rem]"
        disabled={busy || !connected}
        onClick={() => void applyHold(null)}
      >
        <OctagonAlert aria-hidden />
        Stop
      </Button>
    </section>
  );
}
