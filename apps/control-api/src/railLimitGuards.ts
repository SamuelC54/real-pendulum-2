import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import {
  isMotionBlockedByLatch,
  motionLatchErrorMessage,
} from "./motionLatch.js";
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

function travelLimitJogErrorMessage(limits: TravelLimitSwitchState): string {
  if (limits.limitLeftPressed) {
    return "Left travel limit is active — cannot jog further left.";
  }
  if (limits.limitRightPressed) {
    return "Right travel limit is active — cannot jog further right.";
  }
  return "Travel limit active — jog blocked in that direction.";
}

export async function setJogVelocityRpmRespectingTravelLimits(
  rpm: number,
  options?: { maxAccelerationRpmPerSec?: number },
): Promise<{ ok: boolean; error: string }> {
  if (isMotionBlockedByLatch()) {
    return { ok: false, error: motionLatchErrorMessage() };
  }
  const limits = await sensor.getSensorStatus();
  const effective = clampJogRpmForTravelLimits(rpm, limits);
  if (rpm !== 0 && effective === 0) {
    return { ok: false, error: travelLimitJogErrorMessage(limits) };
  }
  if (options?.maxAccelerationRpmPerSec !== undefined) {
    return motor.setJogVelocityRpm(effective, options);
  }
  return motor.setJogVelocityRpm(effective);
}

export async function moveToPositionCmRespectingTravelLimits(
  positionCm: number,
  opts?: {
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
    /** Latch-recovery move to center — bypasses latch and limit-switch move guard. */
    recovery?: boolean;
  },
): Promise<{ ok: boolean; error: string }> {
  if (!opts?.recovery) {
    if (isMotionBlockedByLatch()) {
      return { ok: false, error: motionLatchErrorMessage() };
    }
    const limits = await sensor.getSensorStatus();
    const st = await motor.getMotorStatus();
    const currentCm =
      st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)
        ? teknicMeasuredToCm(st.measuredPosition)
        : undefined;
    const travelGuard = guardMoveAbsolutePositionCm(positionCm, limits, currentCm);
    if (travelGuard) return { ok: false, error: travelGuard };
  }
  return motor.moveToPosition(cmToTeknicMeasured(positionCm), opts);
}
