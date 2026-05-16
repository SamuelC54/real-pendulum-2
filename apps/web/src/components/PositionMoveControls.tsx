import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { Crosshair, Home, LocateFixed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
  JOG_RPM,
  POSITION_MOVE_ACC_SLIDER_MAX,
  POSITION_MOVE_VEL_SLIDER_MAX,
  POSITION_TARGET_SLIDER_MAX,
  POSITION_TARGET_SLIDER_MIN,
} from "@/lib/jogMath";
import {
  boundsFromTravelSwitchDisplays,
  motorCountsForDisplay,
} from "@/lib/motorPositionDisplay";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function ProfileSlider({
  label,
  labelAddon,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  label: string;
  labelAddon?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          {labelAddon}
        </div>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {value}
          {suffix ? (
            <span className="text-muted-foreground ml-1 text-[11px] font-sans">{suffix}</span>
          ) : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="accent-primary h-2 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export const PositionMoveControls = memo(function PositionMoveControls() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  const connected = status.data?.connected ?? false;
  const sensorConnected = sensor.data?.connected ?? false;
  const displayNow = motorCountsForDisplay(status.data?.measuredPosition);

  const limitLeft = sensor.data?.limitLeftPressed ?? false;
  const limitRight = sensor.data?.limitRightPressed ?? false;

  /** Rising-edge → server snapshots motor position (`rail.limits.record`). */
  const prevLimits = useRef({ L: false, R: false });
  const prevSensorConnected = useRef(false);

  const [maxVelRpm, setMaxVelRpm] = useState(JOG_RPM);
  const [maxAccelRpmPerSec, setMaxAccelRpmPerSec] = useState(DEFAULT_PROFILE_ACC_RPM_PER_SEC);
  const [targetCounts, setTargetCounts] = useState(0);

  const moveSingle = trpc.rail.moveAbsolute.useMutation({
    onSuccess: () => {
      void utils.status.get.invalidate();
      void utils.twin.status.get.invalidate();
    },
  });
  const moveTwin = trpc.twin.rail.moveAbsolute.useMutation({
    onSuccess: () => {
      void utils.status.get.invalidate();
      void utils.twin.status.get.invalidate();
    },
  });
  const moveAbsolute = mode === "twin" ? moveTwin : moveSingle;

  const recordSingle = trpc.rail.limits.record.useMutation({
    onSuccess: () => {
      void utils.status.get.invalidate();
      void utils.twin.status.get.invalidate();
    },
  });
  const recordTwin = trpc.twin.rail.limits.record.useMutation({
    onSuccess: () => {
      void utils.status.get.invalidate();
      void utils.twin.status.get.invalidate();
    },
  });
  const recordTravelLimit = mode === "twin" ? recordTwin : recordSingle;

  const busy = moveAbsolute.isPending;
  const disabled = !connected || busy;

  /** When serial opens, seed edge detector so the first poll is not a false rising edge. */
  useEffect(() => {
    if (sensorConnected && !prevSensorConnected.current) {
      prevLimits.current = { L: limitLeft, R: limitRight };
    }
    prevSensorConnected.current = sensorConnected;
  }, [sensorConnected, limitLeft, limitRight]);

  useEffect(() => {
    if (!sensorConnected || !connected) return;
    const pos = motorCountsForDisplay(status.data?.measuredPosition);
    if (pos === undefined || !Number.isFinite(pos)) return;

    if (limitLeft && !prevLimits.current.L) {
      void recordTravelLimit.mutateAsync({ side: "left" }).catch(() => {});
    }
    if (limitRight && !prevLimits.current.R) {
      void recordTravelLimit.mutateAsync({ side: "right" }).catch(() => {});
    }
    prevLimits.current = { L: limitLeft, R: limitRight };
    // recordTravelLimit.mutateAsync is stable (tRPC / React Query).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [connected, sensorConnected, limitLeft, limitRight, status.data?.measuredPosition]);

  const travelLimits = status.data?.travelLimits;
  const leftStopCounts = travelLimits?.left ?? null;
  const rightStopCounts = travelLimits?.right ?? null;

  const {
    targetSliderMin,
    targetSliderMax,
    targetStep,
    limitsReady,
  } = useMemo(() => {
    const spanBounds = boundsFromTravelSwitchDisplays(leftStopCounts, rightStopCounts);
    if (spanBounds) {
      const min = spanBounds.min;
      const max = spanBounds.max;
      const span = max - min;
      const step = Math.max(1, Math.min(100, Math.floor(span / 200)));
      return {
        targetSliderMin: min,
        targetSliderMax: max <= min ? min + 1 : max,
        targetStep: step,
        limitsReady: true,
      };
    }
    return {
      targetSliderMin: POSITION_TARGET_SLIDER_MIN,
      targetSliderMax: POSITION_TARGET_SLIDER_MAX,
      targetStep: 10,
      limitsReady: false,
    };
  }, [leftStopCounts, rightStopCounts]);

  const runMoveToDisplayCounts = useCallback(
    (displayCounts: number) => {
      void moveAbsolute.mutateAsync({
        displayCounts,
        maxVelocityRpm: clamp(maxVelRpm, 1, POSITION_MOVE_VEL_SLIDER_MAX),
        maxAccelerationRpmPerSec: clamp(maxAccelRpmPerSec, 1, POSITION_MOVE_ACC_SLIDER_MAX),
      });
    },
    [maxAccelRpmPerSec, maxVelRpm, moveAbsolute],
  );

  const sliderTargetValue = clamp(targetCounts, targetSliderMin, targetSliderMax);

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Move to position</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Teknic absolute profile move (<code className="text-foreground">MovePosnStart</code>). Target
        uses <strong className="text-foreground font-medium">display</strong> counts. When the Sensor
        Board is connected,{" "}
        <strong className="text-foreground font-medium">jog to each travel limit once</strong> — the
        moment each switch closes, the control API records that position (same values as the rail card).
        Until both are captured, the target slider spans{" "}
        <span className="font-mono text-foreground">{POSITION_TARGET_SLIDER_MIN}</span> …{" "}
        <span className="font-mono text-foreground">{POSITION_TARGET_SLIDER_MAX}</span>.
      </p>

      <div className="flex flex-col gap-5">
        <ProfileSlider
          label="Max profile RPM"
          min={1}
          max={POSITION_MOVE_VEL_SLIDER_MAX}
          step={1}
          value={clamp(maxVelRpm, 1, POSITION_MOVE_VEL_SLIDER_MAX)}
          onChange={(v) => setMaxVelRpm(v)}
          disabled={disabled}
          suffix="RPM"
        />
        <ProfileSlider
          label="Max acceleration"
          min={1}
          max={POSITION_MOVE_ACC_SLIDER_MAX}
          step={10}
          value={clamp(maxAccelRpmPerSec, 1, POSITION_MOVE_ACC_SLIDER_MAX)}
          onChange={(v) => setMaxAccelRpmPerSec(v)}
          disabled={disabled}
          suffix="RPM/s"
        />
        <div className="flex flex-col gap-1">
          <ProfileSlider
            label="Target display counts"
            labelAddon={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={disabled || displayNow === undefined || !Number.isFinite(displayNow)}
                aria-label="Use current position"
                title="Use current position"
                onClick={() => {
                  if (displayNow === undefined || !Number.isFinite(displayNow)) return;
                  setTargetCounts(clamp(Math.round(displayNow), targetSliderMin, targetSliderMax));
                }}
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
              </Button>
            }
            min={targetSliderMin}
            max={targetSliderMax}
            step={targetStep}
            value={sliderTargetValue}
            onChange={(v) => setTargetCounts(v)}
            disabled={disabled}
          />
          <p className="text-muted-foreground text-[10px] leading-snug">
            {limitsReady ? (
              <>
                Limit stops recorded — slider{" "}
                <span className="font-mono text-foreground">{targetSliderMin}</span> …{" "}
                <span className="font-mono text-foreground">{targetSliderMax}</span>{" "}
                <span className="text-muted-foreground/80">
                  (left {leftStopCounts?.toFixed(1)} · right {rightStopCounts?.toFixed(1)})
                </span>
              </>
            ) : (
              <>
                Left stop {leftStopCounts != null ? <span className="font-mono text-foreground">{leftStopCounts.toFixed(1)}</span> : "—"} · Right stop{" "}
                {rightStopCounts != null ? <span className="font-mono text-foreground">{rightStopCounts.toFixed(1)}</span> : "—"}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex w-full gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 flex-1 touch-manipulation"
          disabled={disabled}
          title="Absolute move to 0 display counts (home / Teknic origin)"
          onClick={() => runMoveToDisplayCounts(0)}
        >
          <Home aria-hidden className="mr-2 h-4 w-4 shrink-0" />
          Move to home
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-0 flex-1 touch-manipulation"
          disabled={disabled}
          onClick={() => runMoveToDisplayCounts(sliderTargetValue)}
        >
          <Crosshair aria-hidden className="mr-2 h-4 w-4 shrink-0" />
          Go
        </Button>
      </div>

      {moveAbsolute.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.error.message}</p>
      ) : null}
      {moveAbsolute.data && "real" in moveAbsolute.data ? (
        <>
          {!moveAbsolute.data.real.ok && moveAbsolute.data.real.error ? (
            <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.data.real.error}</p>
          ) : null}
          {!moveAbsolute.data.sim.ok && moveAbsolute.data.sim.error ? (
            <p className="text-destructive wrap-break-word text-xs">
              Sim move: {moveAbsolute.data.sim.error}
            </p>
          ) : null}
        </>
      ) : moveAbsolute.data &&
        !("real" in moveAbsolute.data) &&
        !moveAbsolute.data.ok &&
        moveAbsolute.data.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.data.error}</p>
      ) : null}
    </Card>
  );
});
