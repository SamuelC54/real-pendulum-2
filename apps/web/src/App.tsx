import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc";

const JOG_RPM = 120;

export default function App() {
  const status = trpc.status.get.useQuery(undefined, { refetchInterval: 1000 });
  const setVelocity = trpc.jog.setVelocity.useMutation();
  const stop = trpc.jog.stop.useMutation();

  const [holding, setHolding] = useState<"left" | "right" | null>(null);

  const refetchStatus = status.refetch;

  const applyHold = useCallback(
    async (dir: "left" | "right" | null) => {
      setHolding(dir);
      if (!dir) {
        await stop.mutateAsync();
        await refetchStatus();
        return;
      }
      const rpm = dir === "left" ? -JOG_RPM : JOG_RPM;
      await setVelocity.mutateAsync({ rpm });
      await refetchStatus();
    },
    [setVelocity, stop, refetchStatus],
  );

  useEffect(() => {
    const onBlur = () => {
      void applyHold(null);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [applyHold]);

  const stopMutateRef = useRef(stop.mutate);
  stopMutateRef.current = stop.mutate;
  useEffect(() => {
    return () => {
      void stopMutateRef.current();
    };
  }, []);

  const busy = setVelocity.isPending || stop.isPending;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Linear rail jog</h1>
          <p className="text-muted-foreground text-sm">
            Hold a direction to jog the cart ({JOG_RPM} rpm command). Release or leave the window to
            stop.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm font-medium">Status</span>
            <span className="font-mono text-sm">
              {status.data?.connected ? (
                <>
                  commanded{" "}
                  <span className="text-foreground font-semibold">
                    {status.data.commandedRpm.toFixed(1)}
                  </span>{" "}
                  rpm
                </>
              ) : (
                <span className="text-destructive">motor unavailable</span>
              )}
            </span>
          </div>
          {status.data?.detail ? (
            <p className="text-muted-foreground text-xs leading-relaxed">{status.data.detail}</p>
          ) : null}
        </section>

        <section className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-md gap-4">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1 touch-manipulation select-none"
              disabled={busy}
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
              disabled={busy}
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
            disabled={busy}
            onClick={() => void applyHold(null)}
          >
            <OctagonAlert aria-hidden />
            Stop
          </Button>
        </section>
      </div>
    </div>
  );
}
