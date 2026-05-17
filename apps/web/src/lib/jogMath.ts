/** Default jog speed magnitude (rpm); sign comes from direction. */
export const JOG_RPM_DEFAULT = 120;

/** @deprecated Use {@link JOG_RPM_DEFAULT} */
export const JOG_RPM = JOG_RPM_DEFAULT;

/** Software clamp on Teknic jog (`TeknicCfg::kJogVelLimitRpm`). */
export const JOG_RPM_SLIDER_MAX = 4000;

/**
 * Default host **`Motion.AccLimit`** (RPM/s with `AccUnit` RPM_PER_SEC) for move-to-position UI — matches
 * **`TeknicCfg::kAccLimitRpmPerSec`** in `teknic_cfg.h` / DLL defaults.
 */
export const DEFAULT_PROFILE_ACC_RPM_PER_SEC = 1000;

/** Aligns with **`TeknicCfg::kPositionMoveVelCeilingRpm`** in native — slider max for profile RPM. */
export const POSITION_MOVE_VEL_SLIDER_MAX = 4000;

/** Aligns with **`TeknicCfg::kPositionMoveAccCeilingRpmPerSec`**. */
export const POSITION_MOVE_ACC_SLIDER_MAX = 50000;

import { displayCountsPerCm } from "@/lib/railPositionCm";

/** Fallback target slider span (cm) when travel-limit stops are not yet recorded (~±1000 display counts). */
export const POSITION_TARGET_SLIDER_MIN_CM = -1000 / displayCountsPerCm();
export const POSITION_TARGET_SLIDER_MAX_CM = 1000 / displayCountsPerCm();

export function jogRpmForDirection(dir: "left" | "right", magnitudeRpm = JOG_RPM_DEFAULT): number {
  const mag = Math.abs(magnitudeRpm);
  return dir === "left" ? mag : -mag;
}

export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

export type MotionLatchState = {
  latched: boolean;
  side: "left" | "right" | null;
  towardCenterJog?: "left" | "right" | null;
};

/** Jog direction allowed toward 0 cm while latched (left limit → right, etc.). */
export function towardCenterJogDirection(
  latch: MotionLatchState | undefined,
): "left" | "right" | null {
  if (!latch?.latched) return null;
  if (latch.towardCenterJog) return latch.towardCenterJog;
  if (latch.side === "left") return "right";
  if (latch.side === "right") return "left";
  return null;
}

/** True when jog in `dir` would travel further into an active limit (matches control-api guards). */
export function isJogBlockedByTravelLimit(
  dir: "left" | "right",
  limits: TravelLimitSwitchState,
  latch?: MotionLatchState,
): boolean {
  if (!limits.connected) return false;
  if (towardCenterJogDirection(latch) === dir) return false;
  if (dir === "left" && limits.limitLeftPressed) return true;
  if (dir === "right" && limits.limitRightPressed) return true;
  return false;
}

/** Active jog hold that must release because its direction hit a travel limit. */
export function shouldReleaseJogHoldForTravelLimit(
  holding: "left" | "right" | null,
  limits: TravelLimitSwitchState,
  latch?: MotionLatchState,
): boolean {
  if (!holding) return false;
  return isJogBlockedByTravelLimit(holding, limits, latch);
}

export function isMoveTargetBlockedByTravelLimit(
  targetCm: number,
  currentCm: number | undefined,
  limits: TravelLimitSwitchState,
): boolean {
  if (!limits.connected || currentCm === undefined || !Number.isFinite(currentCm)) {
    return false;
  }
  if (limits.limitLeftPressed && targetCm < currentCm) return true;
  if (limits.limitRightPressed && targetCm > currentCm) return true;
  return false;
}

/** While latched, only the toward-center jog direction is enabled. */
export function isJogBlockedByMotionLatch(
  dir: "left" | "right",
  latch: MotionLatchState | undefined,
): boolean {
  const toward = towardCenterJogDirection(latch);
  if (!toward) return false;
  return dir !== toward;
}

export function isMoveTargetBlockedByMotionLatch(
  targetCm: number,
  currentCm: number | undefined,
  latch: MotionLatchState | undefined,
): boolean {
  if (!latch?.latched || !latch.side || currentCm === undefined || !Number.isFinite(currentCm)) {
    return false;
  }
  if (latch.side === "left" && targetCm < currentCm) return true;
  if (latch.side === "right" && targetCm > currentCm) return true;
  return false;
}

export function shouldReleaseJogHoldForMotionLatch(
  holding: "left" | "right" | null,
  latch: MotionLatchState | undefined,
): boolean {
  if (!holding) return false;
  return isJogBlockedByMotionLatch(holding, latch);
}
