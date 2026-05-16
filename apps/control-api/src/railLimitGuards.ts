import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { cmToTeknicMeasured, teknicMeasuredToCm } from "./railPositionCm.js";

/** Limit-switch snapshot from sensor-service (same wire as `sensor.getSensorStatus`). */
export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

/**
 * Jog convention (web + homing): left along rail = positive RPM, right = negative.
 * When a limit is active, block further travel in that direction (RPM clamped to 0).
 */
export function clampJogRpmForTravelLimits(
  rpm: number,
  limits: TravelLimitSwitchState,
): number {
  if (rpm === 0 || !limits.connected) return rpm;
  if (limits.limitLeftPressed && rpm > 0) return 0;
  if (limits.limitRightPressed && rpm < 0) return 0;
  return rpm;
}

/** Returns an error message when `positionCm` would move further into an active limit. */
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

export async function setJogVelocityRpmRespectingTravelLimits(
  rpm: number,
): Promise<{ ok: boolean; error: string }> {
  const limits = await sensor.getSensorStatus();
  const effective = clampJogRpmForTravelLimits(rpm, limits);
  return motor.setJogVelocityRpm(effective);
}

export async function moveToPositionCmRespectingTravelLimits(
  positionCm: number,
  opts?: {
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
  },
): Promise<{ ok: boolean; error: string }> {
  const limits = await sensor.getSensorStatus();
  const st = await motor.getMotorStatus();
  const currentCm =
    st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)
      ? teknicMeasuredToCm(st.measuredPosition)
      : undefined;
  const guard = guardMoveAbsolutePositionCm(positionCm, limits, currentCm);
  if (guard) return { ok: false, error: guard };
  return motor.moveToPosition(cmToTeknicMeasured(positionCm), opts);
}
