export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

export function clampJogCmPerSecForTravelLimits(
  cmPerSec: number,
  limits: TravelLimitSwitchState,
): number {
  if (cmPerSec === 0 || !limits.connected) return cmPerSec;
  if (limits.limitLeftPressed && cmPerSec < 0) return 0;
  if (limits.limitRightPressed && cmPerSec > 0) return 0;
  return cmPerSec;
}

export function guardMoveAbsolutePositionCm(
  targetCm: number,
  limits: TravelLimitSwitchState,
  currentCm?: number,
): string | null {
  if (!limits.connected || currentCm === undefined || !Number.isFinite(currentCm)) {
    return null;
  }
  if (limits.limitLeftPressed && targetCm < currentCm) {
    return "Left travel limit is active — cannot move further left.";
  }
  if (limits.limitRightPressed && targetCm > currentCm) {
    return "Right travel limit is active — cannot move further right.";
  }
  return null;
}
