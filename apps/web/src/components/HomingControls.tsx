import { memo, useEffect, useState } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";
import { trpc } from "@/trpc";
import { useMotorStatusConnected } from "@/services/useMotorStatusQuery";

export const HomingControls = memo(function HomingControls() {
  const utils = trpc.useUtils();
  const motorConnected = useMotorStatusConnected().data ?? false;
  const sensorStatus = trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: 1500,
  });
  const sensorConnected = sensorStatus.data?.connected ?? false;

  const home = trpc.rail.home.useMutation({
    onSuccess: () => {
      void utils.status.get.invalidate();
      void utils.sensor.status.get.invalidate();
    },
  });

  const ready = motorConnected && sensorConnected;
  const disabled = !ready || home.isPending;

  const railHomeResult = home.data;
  const [homingDetailOpen, setHomingDetailOpen] = useState(true);

  useEffect(() => {
    if (railHomeResult != null) setHomingDetailOpen(true);
  }, [railHomeResult]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Homing</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Uses Teknic <strong className="text-foreground font-medium">measured motor position</strong>{" "}
        for rail travel; the Sensor Board only supplies travel limit switches (the rotary encoder there is
        for the pendulum). Optional slow final approach, then zeros Teknic position at center by
        default.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full touch-manipulation sm:w-auto"
        disabled={disabled}
        onClick={() => void home.mutateAsync()}
      >
        <Home
          aria-hidden
          className={home.isPending ? "mr-2 h-5 w-5 animate-pulse" : "mr-2 h-5 w-5"}
        />
        Home rail
      </Button>
      {!motorConnected ? (
        <p className="text-muted-foreground text-xs">Connect the Motor Board first.</p>
      ) : null}
      {!sensorConnected ? (
        <p className="text-muted-foreground text-xs">Connect the Sensor Board first.</p>
      ) : null}
      {home.error ? (
        <p className="text-destructive text-xs">{home.error.message}</p>
      ) : null}
      {railHomeResult ? (
        <div
          className={
            railHomeResult.ok ? "text-muted-foreground text-xs" : "text-destructive text-xs"
          }
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{railHomeResult.ok ? "Homing finished" : "Homing failed"}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              aria-expanded={homingDetailOpen}
              onClick={() => setHomingDetailOpen((o) => !o)}
            >
              {homingDetailOpen ? "Hide detail" : "Show detail"}
            </Button>
          </div>
          {homingDetailOpen ? (
            <>
              {railHomeResult.motorSpanCounts != null ? (
                <p>
                  Motor span:{" "}
                  <span className="font-mono text-foreground">{railHomeResult.motorSpanCounts.toFixed(1)}</span>{" "}
                  counts · mid target:{" "}
                  <span className="font-mono text-foreground">
                    {railHomeResult.midMotorPosition != null
                      ? motorCountsForDisplay(railHomeResult.midMotorPosition)!.toFixed(1)
                      : "—"}
                  </span>
                </p>
              ) : null}
              {railHomeResult.motorAbsRevolutions != null ? (
                <p>
                  Motor Board ∫|rpm|·dt/60 ≈{" "}
                  <span className="font-mono text-foreground">
                    {railHomeResult.motorAbsRevolutions.toFixed(2)}
                  </span>{" "}
                  rev (commanded-velocity estimate)
                </p>
              ) : null}
              {railHomeResult.motorPositionZeroedAtMid != null ? (
                <p>
                  Motor Board position at center:{" "}
                  {railHomeResult.motorPositionZeroedAtMid ? (
                    <span className="text-foreground">zeroed (Teknic)</span>
                  ) : (
                    <span className="text-destructive">zero failed — see log</span>
                  )}
                </p>
              ) : null}
              {railHomeResult.log?.length ? (
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
                  {railHomeResult.log.join("\n")}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
