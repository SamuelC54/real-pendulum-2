import { memo } from "react";
import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { ProfileSlider } from "@/components/ProfileSlider";
import { Card } from "@/components/ui/card";
import { RailPendulumSchematic } from "@/components/RailPendulumSchematic";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { isJogBlockedByTravelLimit, JOG_RPM_SLIDER_MAX, POSITION_MOVE_ACC_SLIDER_MAX } from "@/lib/jogMath";
import { useMotorSession } from "@/services/motorSession";
import { useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { useLimitSwitchModeSubscription } from "@/hooks/useLimitSwitchModeSubscription";
import {
  holdingAtom,
  jogAccelRpmPerSecAtom,
  jogRpmAtom,
  keyboardJogEnabledAtom,
} from "@/stores/jog";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Held look via aria-pressed — keeps variant="secondary" so CVA does not swap presets (avoids transition-colors flicker). */
const jogDirectionClasses =
  "flex-1 touch-manipulation select-none transition-none aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:z-10 aria-pressed:shadow-lg aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background";

type JogDirection = "left" | "right";

const JogDirectionButton = memo(function JogDirectionButton({
  direction,
  held,
  disabled,
  onPointerHold,
  onPointerRelease,
}: {
  direction: JogDirection;
  held: boolean;
  disabled: boolean;
  onPointerHold: (dir: JogDirection) => void | Promise<void>;
  onPointerRelease: () => void | Promise<void>;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className={cn(jogDirectionClasses)}
      disabled={disabled}
      aria-pressed={held}
      onPointerDown={(e) => {
        e.preventDefault();
        void onPointerHold(direction);
      }}
      onPointerUp={() => void onPointerRelease()}
      onPointerCancel={() => void onPointerRelease()}
      onPointerLeave={(e) => {
        if (e.buttons === 0) void onPointerRelease();
      }}
      onLostPointerCapture={() => void onPointerRelease()}
    >
      {direction === "left" ? (
        <>
          <ChevronLeft aria-hidden />
          Jog left
        </>
      ) : (
        <>
          Jog right
          <ChevronRight aria-hidden />
        </>
      )}
    </Button>
  );
});

export const JogControls = memo(function JogControls({ className }: { className?: string }) {
  const {
    connected,
    applyPointerHold,
    applyPointerRelease,
    applyJogStop,
    connect,
    disconnect,
    setVelocity,
  } = useMotorSession();
  const holding = useAtomValue(holdingAtom);
  const [jogRpm, setJogRpm] = useAtom(jogRpmAtom);
  const [jogAccelRpmPerSec, setJogAccelRpmPerSec] = useAtom(jogAccelRpmPerSecAtom);
  const [keyboardJogEnabled, setKeyboardJogEnabled] = useAtom(keyboardJogEnabledAtom);
  const sensor = useSensorStatusQuery();
  const limitSwitchMode = useLimitSwitchModeSubscription();
  const travelLimits = {
    connected: sensor.data?.connection.sensor ?? false,
    limitLeftPressed: sensor.data?.limitSwitch.leftPressed ?? false,
    limitRightPressed: sensor.data?.limitSwitch.rightPressed ?? false,
  };

  const connectionBusy = connect.isPending || disconnect.isPending;
  // Stop pending must not disable jog buttons (latch recovery); only block double-starts on setVelocity.
  const latched = limitSwitchMode.data?.latched === true;
  const disabled =
    !connected ||
    connectionBusy ||
    latched ||
    (setVelocity.isPending && holding === null);
  const leftBlocked = isJogBlockedByTravelLimit("left", travelLimits);
  const rightBlocked = isJogBlockedByTravelLimit("right", travelLimits);
  const slidersDisabled = !connected || connectionBusy;

  return (
    <Card className={cn("flex flex-col gap-4 p-6", className)} aria-label="Jog controls">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="keyboard-jog"
            className="text-muted-foreground cursor-pointer text-xs leading-snug"
          >
            Keyboard jog{" "}
            <span className="font-mono text-foreground">←</span> /{" "}
            <span className="font-mono text-foreground">→</span>
          </label>
          <Switch
            id="keyboard-jog"
            checked={keyboardJogEnabled}
            onCheckedChange={setKeyboardJogEnabled}
            aria-label="Enable keyboard jog with arrow keys"
          />
        </div>
        <ProfileSlider
          label="Jog RPM"
          min={1}
          max={JOG_RPM_SLIDER_MAX}
          step={1}
          value={clamp(jogRpm, 1, JOG_RPM_SLIDER_MAX)}
          onChange={setJogRpm}
          disabled={slidersDisabled}
          suffix="RPM"
        />
        <ProfileSlider
          label="Acceleration"
          min={1}
          max={POSITION_MOVE_ACC_SLIDER_MAX}
          step={10}
          value={clamp(jogAccelRpmPerSec, 1, POSITION_MOVE_ACC_SLIDER_MAX)}
          onChange={setJogAccelRpmPerSec}
          disabled={slidersDisabled}
          suffix="RPM/s"
        />
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full max-w-md gap-4">
          <JogDirectionButton
            direction="left"
            held={holding === "left"}
            disabled={disabled || leftBlocked}
            onPointerHold={applyPointerHold}
            onPointerRelease={applyPointerRelease}
          />
          <JogDirectionButton
            direction="right"
            held={holding === "right"}
            disabled={disabled || rightBlocked}
            onPointerHold={applyPointerHold}
            onPointerRelease={applyPointerRelease}
          />
        </div>

        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="min-w-48"
          disabled={disabled}
          onClick={() => void applyJogStop()}
        >
          <OctagonAlert aria-hidden />
          Stop
        </Button>

        {latched ? (
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            Motion latched — use recovery controls in the banner above.
          </p>
        ) : leftBlocked || rightBlocked ? (
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {leftBlocked ? "Left limit active — jog left blocked. " : null}
            {rightBlocked ? "Right limit active — jog right blocked." : null}
          </p>
        ) : null}

        <RailPendulumSchematic />
      </div>
    </Card>
  );
});
