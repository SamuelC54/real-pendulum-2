import { memo, useCallback, useState } from "react";
import { Crosshair, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_PROFILE_ACC_RPM_PER_SEC, JOG_RPM } from "@/lib/jogMath";
import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";
import { trpc } from "@/trpc";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

export const PositionMoveControls = memo(function PositionMoveControls() {
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const connected = status.data?.connected ?? false;
  const displayNow = motorCountsForDisplay(status.data?.measuredPosition);

  const [raw, setRaw] = useState("");
  /** Peak RPM for the Teknic position profile (`Motion.VelLimit`). Empty = DLL default. */
  const [speedRaw, setSpeedRaw] = useState(String(JOG_RPM));
  /** Motion.AccLimit (RPM per second). Empty = DLL default. */
  const [accelRaw, setAccelRaw] = useState(String(DEFAULT_PROFILE_ACC_RPM_PER_SEC));

  const moveAbsolute = trpc.rail.moveAbsolute.useMutation({
    onSuccess: () => void utils.status.get.invalidate(),
  });

  const busy = moveAbsolute.isPending;
  const speedTrim = speedRaw.trim();
  const speedNum = speedTrim === "" ? undefined : Number(speedTrim);
  const speedInvalid =
    speedTrim !== "" &&
    (speedNum === undefined || !Number.isFinite(speedNum) || speedNum <= 0);

  const accelTrim = accelRaw.trim();
  const accelNum = accelTrim === "" ? undefined : Number(accelTrim);
  const accelInvalid =
    accelTrim !== "" &&
    (accelNum === undefined || !Number.isFinite(accelNum) || accelNum <= 0);

  const submitDisabled =
    !connected ||
    busy ||
    raw.trim() === "" ||
    Number.isNaN(Number(raw)) ||
    speedInvalid ||
    accelInvalid;

  const homeDisabled =
    !connected || busy || speedInvalid || accelInvalid;

  const runMoveToDisplayCounts = useCallback(
    (displayCounts: number) => {
      const maxVelocityRpm =
        speedTrim === "" ||
        speedNum === undefined ||
        !Number.isFinite(speedNum) ||
        speedNum <= 0
          ? undefined
          : speedNum;
      const maxAccelerationRpmPerSec =
        accelTrim === "" ||
        accelNum === undefined ||
        !Number.isFinite(accelNum) ||
        accelNum <= 0
          ? undefined
          : accelNum;
      void moveAbsolute.mutateAsync({
        displayCounts,
        ...(maxVelocityRpm !== undefined ? { maxVelocityRpm } : {}),
        ...(maxAccelerationRpmPerSec !== undefined
          ? { maxAccelerationRpmPerSec }
          : {}),
      });
    },
    [
      accelNum,
      accelTrim,
      moveAbsolute,
      speedNum,
      speedTrim,
    ],
  );

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Move to position</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Teknic absolute profile move (<code className="text-foreground">MovePosnStart</code>, not jog
        velocity). Target uses the same <strong className="text-foreground font-medium">display</strong>{" "}
        counts as the Motor Board strip (left negative, right positive). Max RPM and acceleration cap
        Teknic profile limits for this move; clear a field to use the DLL default for that limit.{" "}
        <strong className="text-foreground font-medium">Home</strong> is{" "}
        <span className="font-mono">0</span> display counts (Teknic origin after zero / homing at center).
      </p>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          runMoveToDisplayCounts(n);
        }}
      >
        <label className="flex min-w-[130px] flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Max accel (RPM/s)</span>
          <input
            type="number"
            min={1}
            step={1}
            className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={accelRaw}
            onChange={(e) => setAccelRaw(e.target.value)}
            disabled={!connected || busy}
            placeholder="Default"
          />
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Max profile RPM</span>
          <input
            type="number"
            min={1}
            step={1}
            className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={speedRaw}
            onChange={(e) => setSpeedRaw(e.target.value)}
            disabled={!connected || busy}
            placeholder="Default"
          />
        </label>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={homeDisabled}
            title="Absolute move to 0 display counts (home / Teknic origin)"
            onClick={() => runMoveToDisplayCounts(0)}
          >
            <Home aria-hidden className="mr-2 h-4 w-4" />
            Move to home
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
      {speedInvalid ? (
        <p className="text-destructive text-xs">Enter a positive RPM, or clear the field for default.</p>
      ) : null}
      {accelInvalid ? (
        <p className="text-destructive text-xs">
          Enter a positive acceleration (RPM/s), or clear the field for default.
        </p>
      ) : null}
    </section>
  );
});
