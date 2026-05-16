import { memo, useCallback } from "react";
import { Home } from "lucide-react";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
  isMoveTargetBlockedByTravelLimit,
  JOG_RPM_DEFAULT,
} from "@/lib/jogMath";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

type MoveToHomeButtonProps = {
  connected: boolean;
  connectionBusy: boolean;
  className?: string;
};

export const MoveToHomeButton = memo(function MoveToHomeButton({
  connected,
  connectionBusy,
  className,
}: MoveToHomeButtonProps) {
  const mode = useAtomValue(grpcBackendModeAtom);
  const utils = trpc.useUtils();
  const status = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

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

  const travelLimits = {
    connected: sensor.data?.connected ?? false,
    limitLeftPressed: sensor.data?.limitLeftPressed ?? false,
    limitRightPressed: sensor.data?.limitRightPressed ?? false,
  };
  const moveHomeBlocked = isMoveTargetBlockedByTravelLimit(
    0,
    status.data?.positionCm,
    travelLimits,
  );

  const runMoveToHome = useCallback(() => {
    void moveAbsolute.mutateAsync({
      positionCm: 0,
      maxVelocityRpm: JOG_RPM_DEFAULT,
      maxAccelerationRpmPerSec: DEFAULT_PROFILE_ACC_RPM_PER_SEC,
    });
  }, [moveAbsolute]);

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={className ?? "min-w-48"}
      disabled={!connected || connectionBusy || moveAbsolute.isPending || moveHomeBlocked}
      title="Absolute move to 0 cm (home / Teknic origin)"
      onClick={runMoveToHome}
    >
      <Home aria-hidden />
      Move to home
    </Button>
  );
});
