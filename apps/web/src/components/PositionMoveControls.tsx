import { memo, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";
import { trpc } from "@/trpc";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

export const PositionMoveControls = memo(function PositionMoveControls() {
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const connected = status.data?.connected ?? false;
  const displayNow = motorCountsForDisplay(status.data?.measuredPosition);

  const [raw, setRaw] = useState("");

  const moveAbsolute = trpc.rail.moveAbsolute.useMutation({
    onSuccess: () => void utils.status.get.invalidate(),
  });

  const busy = moveAbsolute.isPending;
  const submitDisabled =
    !connected || busy || raw.trim() === "" || Number.isNaN(Number(raw));

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Move to position</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Teknic absolute profile move (<code className="text-foreground">MovePosnStart</code>, not jog
        velocity). Target uses the same <strong className="text-foreground font-medium">display</strong>{" "}
        counts as the Motor Board strip (left negative, right positive).
      </p>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          void moveAbsolute.mutateAsync({ displayCounts: n });
        }}
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Target display counts</span>
          <input
            type="number"
            step="any"
            className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            disabled={!connected || busy}
            placeholder={
              displayNow !== undefined && Number.isFinite(displayNow)
                ? String(displayNow)
                : "e.g. 0"
            }
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!connected || busy || displayNow === undefined || !Number.isFinite(displayNow)}
            onClick={() => setRaw(String(displayNow))}
          >
            Use current
          </Button>
          <Button type="submit" variant="secondary" size="sm" disabled={submitDisabled}>
            <Crosshair aria-hidden className="mr-2 h-4 w-4" />
            Go
          </Button>
        </div>
      </form>
      {moveAbsolute.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.error.message}</p>
      ) : null}
      {moveAbsolute.data && !moveAbsolute.data.ok && moveAbsolute.data.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.data.error}</p>
      ) : null}
    </section>
  );
});
