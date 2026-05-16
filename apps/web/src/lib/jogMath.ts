/** Commanded jog magnitude used by the rail UI (rpm); sign comes from direction. */
export const JOG_RPM = 120;

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

export function jogRpmForDirection(dir: "left" | "right"): number {
  return dir === "left" ? JOG_RPM : -JOG_RPM;
}

export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

/** True when jog in `dir` would travel further into an active limit (matches control-api guards). */
export function isJogBlockedByTravelLimit(
  dir: "left" | "right",
  limits: TravelLimitSwitchState,
): boolean {
  if (!limits.connected) return false;
  if (dir === "left" && limits.limitLeftPressed) return true;
  if (dir === "right" && limits.limitRightPressed) return true;
  return false;
}

/** Active jog hold that must release because its direction hit a travel limit. */
export function shouldReleaseJogHoldForTravelLimit(
  holding: "left" | "right" | null,
  limits: TravelLimitSwitchState,
): boolean {
  if (!holding) return false;
  return isJogBlockedByTravelLimit(holding, limits);
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
