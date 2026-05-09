import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
  JOG_RPM,
  POSITION_MOVE_ACC_SLIDER_MAX,
  POSITION_MOVE_VEL_SLIDER_MAX,
  POSITION_TARGET_SLIDER_MAX,
  POSITION_TARGET_SLIDER_MIN,
} from "@/lib/jogMath";
import { motorCountsForDisplay } from "@/lib/motorPositionDisplay";
import { trpc } from "@/trpc";
import { useMotorStatusQuery } from "@/services/useMotorStatusQuery";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function ProfileSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  label: string;
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
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
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
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const sensor = trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.connected ? 80 : 1500),
  });

  const connected = status.data?.connected ?? false;
  const sensorConnected = sensor.data?.connected ?? false;
  const displayNow = motorCountsForDisplay(status.data?.measuredPosition);

  const limitLeft = sensor.data?.limitLeftPressed ?? false;
  const limitRight = sensor.data?.limitRightPressed ?? false;

  /** Rising-edge capture: position when each switch first closes. */
  const prevLimits = useRef({ L: false, R: false });
  const prevSensorConnected = useRef(false);

  const [leftStopCounts, setLeftStopCounts] = useState<number | null>(null);
  const [rightStopCounts, setRightStopCounts] = useState<number | null>(null);

  const [maxVelRpm, setMaxVelRpm] = useState(JOG_RPM);
  const [maxAccelRpmPerSec, setMaxAccelRpmPerSec] = useState(DEFAULT_PROFILE_ACC_RPM_PER_SEC);
  const [targetCounts, setTargetCounts] = useState(0);

  const moveAbsolute = trpc.rail.moveAbsolute.useMutation({
    onSuccess: () => void utils.status.get.invalidate(),
  });

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
      setLeftStopCounts(pos);
    }
    if (limitRight && !prevLimits.current.R) {
      setRightStopCounts(pos);
    }
    prevLimits.current = { L: limitLeft, R: limitRight };
  }, [
    connected,
    sensorConnected,
    limitLeft,
    limitRight,
    status.data?.measuredPosition,
  ]);

  const {
    targetSliderMin,
    targetSliderMax,
    targetStep,
    limitsReady,
  } = useMemo(() => {
    if (leftStopCounts != null && rightStopCounts != null) {
      const a = Math.min(leftStopCounts, rightStopCounts);
      const b = Math.max(leftStopCounts, rightStopCounts);
      const min = a;
      const max = b <= a ? a + 1 : b;
      const span = max - min;
      const step = Math.max(1, Math.min(100, Math.floor(span / 200)));
      return {
        targetSliderMin: min,
        targetSliderMax: max,
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

  useEffect(() => {
    setTargetCounts((t) => clamp(t, targetSliderMin, targetSliderMax));
  }, [targetSliderMin, targetSliderMax]);

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
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Move to position</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Teknic absolute profile move (<code className="text-foreground">MovePosnStart</code>). Target
        uses <strong className="text-foreground font-medium">display</strong> counts. When the Sensor
        Board is connected,{" "}
        <strong className="text-foreground font-medium">jog to each travel limit once</strong> — the
        moment each switch closes, this panel records that position and sets the target slider ends.
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || displayNow === undefined || !Number.isFinite(displayNow)}
          onClick={() => {
            if (displayNow === undefined || !Number.isFinite(displayNow)) return;
            setTargetCounts(clamp(Math.round(displayNow), targetSliderMin, targetSliderMax));
          }}
        >
          Use current position
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Absolute move to 0 display counts (home / Teknic origin)"
          onClick={() => runMoveToDisplayCounts(0)}
        >
          <Home aria-hidden className="mr-2 h-4 w-4" />
          Move to home
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => runMoveToDisplayCounts(sliderTargetValue)}
        >
          <Crosshair aria-hidden className="mr-2 h-4 w-4" />
          Go
        </Button>
      </div>

      {moveAbsolute.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.error.message}</p>
      ) : null}
      {moveAbsolute.data && !moveAbsolute.data.ok && moveAbsolute.data.error ? (
        <p className="text-destructive wrap-break-word text-xs">{moveAbsolute.data.error}</p>
      ) : null}
    </section>
  );
});
