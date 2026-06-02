import { ChevronLeft, ChevronRight, Home, OctagonAlert } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
  JOG_RPM_DEFAULT,
  rpmToCmPerSec,
} from "@/lib/jogMath";
import { useMotorStatusConnected } from "@/services/useMotorStatusQuery";
import { useLimitSwitchModeSubscription } from "@/hooks/useLimitSwitchModeSubscription";
import { trpc } from "@/trpc";

function RecoveryHoldJogButton({
  direction,
  connected,
  onStart,
  onStop,
}: {
  direction: "left" | "right";
  connected: boolean;
  onStart: () => Promise<void>;
  onStop: () => void;
}) {
  const [held, setHeld] = useState(false);
  const holdEpochRef = useRef(0);
  const stopSentRef = useRef(false);

  const release = useCallback(() => {
    holdEpochRef.current += 1;
    setHeld(false);
    if (stopSentRef.current) return;
    stopSentRef.current = true;
    onStop();
  }, [onStop]);

  const press = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!connected) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const epoch = ++holdEpochRef.current;
      stopSentRef.current = false;
      setHeld(true);
      try {
        await onStart();
        if (holdEpochRef.current !== epoch) {
          onStop();
        }
      } catch {
        if (holdEpochRef.current === epoch) {
          setHeld(false);
          onStop();
        }
      }
    },
    [connected, onStart, onStop],
  );

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className={cn(
        "shrink-0 touch-manipulation select-none transition-none",
        "aria-pressed:bg-primary aria-pressed:text-primary-foreground",
      )}
      disabled={!connected}
      aria-pressed={held}
      title={`Hold to jog ${direction} toward 0 cm`}
      onPointerDown={(e) => void press(e)}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        release();
      }}
      onPointerLeave={(e) => {
        if (e.buttons === 0) release();
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        release();
      }}
    >
      {direction === "left" ? (
        <ChevronLeft className="mr-1.5 h-4 w-4" aria-hidden />
      ) : (
        <ChevronRight className="mr-1.5 h-4 w-4" aria-hidden />
      )}
      Hold jog {direction}
    </Button>
  );
}

export function LimitSwitchModeBanner() {
  const { data: connected = false } = useMotorStatusConnected();
  const utils = trpc.useUtils();

  const modeSub = useLimitSwitchModeSubscription();
  const release = trpc.limitSwitchMode.release.useMutation({
    onSuccess: () => modeSub.reset(),
  });
  const jogStart = trpc.limitSwitchMode.jogStart.useMutation();
  const jogStop = trpc.limitSwitchMode.jogStop.useMutation({
    onSettled: () => {
      void utils.machine.state.get.invalidate();
    },
  });
  const moveHome = trpc.limitSwitchMode.moveHome.useMutation({
    onSuccess: () => {
      modeSub.reset();
      void utils.machine.state.get.invalidate();
    },
  });

  const startRecoveryJog = useCallback(async () => {
    await jogStart.mutateAsync({
      cmPerSec: Math.abs(rpmToCmPerSec(JOG_RPM_DEFAULT)),
      maxAccelerationCmPerSec2: Math.abs(rpmToCmPerSec(DEFAULT_PROFILE_ACC_RPM_PER_SEC)),
    });
  }, [jogStart]);

  const stopRecoveryJog = useCallback(() => {
    void jogStop.mutate(undefined, {
      onSuccess: () => {
        void utils.machine.state.get.invalidate();
      },
    });
  }, [jogStop, utils]);

  const mode = modeSub.data;
  if (!mode?.latched) return null;

  const sideLabel =
    mode.side === "left" ? "Left" : mode.side === "right" ? "Right" : "Travel";
  const cause =
    mode.reason === "position"
      ? `${sideLabel.toLowerCase()} travel limit exceeded (position out of range)`
      : `${sideLabel.toLowerCase()} limit switch`;
  const toward = mode.towardCenterJog;
  const moveHomeBusy = moveHome.isPending;

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-600/50 bg-amber-500/15 px-4 py-3 dark:bg-amber-500/10"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <OctagonAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Motion stopped — {cause}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Normal jog is off while latched. <strong className="text-foreground font-medium">Press and hold</strong>{" "}
            recovery jog (do not tap), or use Move to home, then Release stop when clear.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {toward ? (
          <RecoveryHoldJogButton
            direction={toward}
            connected={connected}
            onStart={startRecoveryJog}
            onStop={stopRecoveryJog}
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-amber-600/50 bg-background/80"
          disabled={!connected || moveHomeBusy}
          title="Absolute move to 0 cm"
          onClick={() =>
            moveHome.mutate({
              maxVelocityCmPerSec: Math.abs(rpmToCmPerSec(JOG_RPM_DEFAULT)),
              maxAccelerationCmPerSec2: Math.abs(rpmToCmPerSec(DEFAULT_PROFILE_ACC_RPM_PER_SEC)),
            })
          }
        >
          <Home className="mr-1.5 h-4 w-4" aria-hidden />
          Move to home
        </Button>
        <Button
          type="button"
          variant="default"
          className="shrink-0 bg-amber-700 hover:bg-amber-800"
          disabled={release.isPending}
          onClick={() => release.mutate()}
        >
          Release stop
        </Button>
      </div>
      {jogStart.error ? (
        <p className="text-destructive text-xs">{jogStart.error.message}</p>
      ) : null}
      {jogStop.error ? (
        <p className="text-destructive text-xs">{jogStop.error.message}</p>
      ) : null}
      {moveHome.error ? (
        <p className="text-destructive text-xs">{moveHome.error.message}</p>
      ) : null}
    </div>
  );
}
