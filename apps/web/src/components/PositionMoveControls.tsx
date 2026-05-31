import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileSlider } from "@/components/ProfileSlider";
import { Crosshair, Home, LocateFixed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
  JOG_RPM,
  POSITION_MOVE_ACC_SLIDER_MAX,
  POSITION_MOVE_VEL_SLIDER_MAX,
  POSITION_TARGET_SLIDER_MAX_CM,
  POSITION_TARGET_SLIDER_MIN_CM,
  isMoveTargetBlockedByTravelLimit,
} from "@/lib/jogMath";
import { boundsFromTravelLimitsCm } from "@/lib/railPositionCm";
import { travelLimitsCm } from "@/lib/machineState";
import { trpc } from "@/trpc";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { useLimitSwitchModeSubscription } from "@/hooks/useLimitSwitchModeSubscription";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}


export const PositionMoveControls = memo(function PositionMoveControls() {
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();
  const limitSwitchMode = useLimitSwitchModeSubscription();

  const connected = status.data?.connection.cart ?? false;
  const sensorConnected = sensor.data?.connection.sensor ?? false;
  const positionNowCm = status.data?.cart.positionCm ?? undefined;

  const limitLeft = sensor.data?.limitSwitch.leftPressed ?? false;
  const limitRight = sensor.data?.limitSwitch.rightPressed ?? false;

  /** Rising-edge → server snapshots motor position (`rail.limits.record`). */
  const prevLimits = useRef({ L: false, R: false });
  const prevSensorConnected = useRef(false);

  const [maxVelRpm, setMaxVelRpm] = useState(JOG_RPM);
  const [maxAccelRpmPerSec, setMaxAccelRpmPerSec] = useState(DEFAULT_PROFILE_ACC_RPM_PER_SEC);
  const [targetCm, setTargetCm] = useState(0);

  const invalidateMachineState = useCallback(() => {
    void utils.machine.state.get.invalidate();
  }, [utils]);

  const moveAbsolute = trpc.machine.move.toPosition.useMutation({
    onSuccess: invalidateMachineState,
  });

  const recordTravelLimit = trpc.machine.travelLimits.recordSide.useMutation({
    onSuccess: invalidateMachineState,
  });

  const busy = moveAbsolute.isPending;
  const latched = limitSwitchMode.data?.latched === true;
  const disabled = !connected || busy || latched;

  /** When serial opens, seed edge detector so the first poll is not a false rising edge. */
  useEffect(() => {
    if (sensorConnected && !prevSensorConnected.current) {
      prevLimits.current = { L: limitLeft, R: limitRight };
    }
    prevSensorConnected.current = sensorConnected;
  }, [sensorConnected, limitLeft, limitRight]);

  useEffect(() => {
    if (!sensorConnected || !connected) return;
    const pos = status.data?.cart.positionCm;
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
  }, [connected, sensorConnected, limitLeft, limitRight, status.data?.cart.positionCm]);

  const limits = travelLimitsCm(status.data);
  const leftStopCm = limits.leftCm;
  const rightStopCm = limits.rightCm;

  const {
    targetSliderMin,
    targetSliderMax,
    targetStep,
    limitsReady,
  } = useMemo(() => {
    const spanBounds = boundsFromTravelLimitsCm(leftStopCm, rightStopCm);
    if (spanBounds) {
      const min = spanBounds.min;
      const max = spanBounds.max;
      const span = max - min;
      const step = Math.max(0.01, Math.min(1, span / 200));
      return {
        targetSliderMin: min,
        targetSliderMax: max <= min ? min + 0.01 : max,
        targetStep: step,
        limitsReady: true,
      };
    }
    return {
      targetSliderMin: POSITION_TARGET_SLIDER_MIN_CM,
      targetSliderMax: POSITION_TARGET_SLIDER_MAX_CM,
      targetStep: 0.1,
      limitsReady: false,
    };
  }, [leftStopCm, rightStopCm]);

  const runMoveToCm = useCallback(
    (positionCm: number) => {
      void moveAbsolute.mutateAsync({
        positionCm,
        maxVelocityRpm: clamp(maxVelRpm, 1, POSITION_MOVE_VEL_SLIDER_MAX),
        maxAccelerationRpmPerSec: clamp(maxAccelRpmPerSec, 1, POSITION_MOVE_ACC_SLIDER_MAX),
      });
    },
    [maxAccelRpmPerSec, maxVelRpm, moveAbsolute],
  );

  const sliderTargetValue = clamp(targetCm, targetSliderMin, targetSliderMax);
  const travelLimitState = {
    connected: sensorConnected,
    limitLeftPressed: limitLeft,
    limitRightPressed: limitRight,
  };
  const moveTargetBlocked = isMoveTargetBlockedByTravelLimit(
    sliderTargetValue,
    positionNowCm,
    travelLimitState,
  );
  const moveHomeBlocked = isMoveTargetBlockedByTravelLimit(0, positionNowCm, travelLimitState);

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Move to position</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Teknic absolute profile move (<code className="text-foreground">MovePosnStart</code>). Target
        is rail position in <strong className="text-foreground font-medium">cm</strong>. When the Sensor
        Board is connected,{" "}
        <strong className="text-foreground font-medium">jog to each travel limit once</strong> — the
        moment each switch closes, the control API records that position (same values as the rail card).
        Until both are captured, the target slider spans{" "}
        <span className="font-mono text-foreground">{POSITION_TARGET_SLIDER_MIN_CM.toFixed(2)}</span> …{" "}
        <span className="font-mono text-foreground">{POSITION_TARGET_SLIDER_MAX_CM.toFixed(2)}</span> cm.
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
            label="Target position (cm)"
            labelAddon={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={disabled || positionNowCm === undefined || !Number.isFinite(positionNowCm)}
                aria-label="Use current position"
                title="Use current position"
                onClick={() => {
                  if (positionNowCm === undefined || !Number.isFinite(positionNowCm)) return;
                  setTargetCm(clamp(positionNowCm, targetSliderMin, targetSliderMax));
                }}
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
              </Button>
            }
            min={targetSliderMin}
            max={targetSliderMax}
            step={targetStep}
            value={sliderTargetValue}
            onChange={(v) => setTargetCm(v)}
            disabled={disabled}
            suffix="cm"
          />
          <p className="text-muted-foreground text-[10px] leading-snug">
            {limitsReady ? (
              <>
                Limit stops recorded — slider{" "}
                <span className="font-mono text-foreground">{targetSliderMin.toFixed(2)}</span> …{" "}
                <span className="font-mono text-foreground">{targetSliderMax.toFixed(2)}</span> cm{" "}
                <span className="text-muted-foreground/80">
                  (left {leftStopCm?.toFixed(2)} · right {rightStopCm?.toFixed(2)})
                </span>
              </>
            ) : (
              <>
                Left stop {leftStopCm != null ? <span className="font-mono text-foreground">{leftStopCm.toFixed(2)}</span> : "—"} · Right stop{" "}
                {rightStopCm != null ? <span className="font-mono text-foreground">{rightStopCm.toFixed(2)}</span> : "—"} cm
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
          disabled={disabled || moveHomeBlocked}
          title="Absolute move to 0 cm (home / Teknic origin)"
          onClick={() => runMoveToCm(0)}
        >
          <Home aria-hidden className="mr-2 h-4 w-4 shrink-0" />
          Move to home
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-0 flex-1 touch-manipulation"
          disabled={disabled || moveTargetBlocked}
          onClick={() => runMoveToCm(sliderTargetValue)}
        >
          <Crosshair aria-hidden className="mr-2 h-4 w-4 shrink-0" />
          Go
        </Button>
      </div>

      {moveTargetBlocked ? (
        <p className="text-muted-foreground text-xs">
          Active travel limit — cannot move further in that direction until you jog away from the switch.
        </p>
      ) : null}

      {moveAbsolute.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.error.message}</p>
      ) : null}
      {moveAbsolute.data && !moveAbsolute.data.ok && moveAbsolute.data.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.data.error}</p>
      ) : null}
    </Card>
  );
});
