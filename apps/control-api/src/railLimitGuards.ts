export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

export function clampJogRpmForTravelLimits(
  rpm: number,
  limits: TravelLimitSwitchState,
): number {
  if (rpm === 0 || !limits.connected) return rpm;
  if (limits.limitLeftPressed && rpm > 0) return 0;
  if (limits.limitRightPressed && rpm < 0) return 0;
  return rpm;
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
