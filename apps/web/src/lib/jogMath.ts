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

import { config } from "@real-pendulum/app-config";
import { displayCountsPerCm } from "@/lib/railPositionCm";

/** Teknic/simulation jog: +RPM moves rail in +cm/s direction (matches control-api motionUnits). */
export function rpmToCmPerSec(rpm: number): number {
  const mpsPerRpm = config.sim.plant.mpsPerRpm;
  return -rpm * mpsPerRpm * 100;
}

export function cmPerSecToRpm(cmPerSec: number): number {
  const mpsPerRpm = config.sim.plant.mpsPerRpm;
  return -cmPerSec / (mpsPerRpm * 100);
}

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

export type LimitSwitchModeState = {
  latched: boolean;
  side: "left" | "right" | null;
  towardCenterJog?: "left" | "right" | null;
};

/** Jog direction allowed toward 0 cm while latched (left limit → right, etc.). */
export function towardCenterJogDirection(
  mode: LimitSwitchModeState | undefined,
): "left" | "right" | null {
  if (!mode?.latched) return null;
  if (mode.towardCenterJog) return mode.towardCenterJog;
  if (mode.side === "left") return "right";
  if (mode.side === "right") return "left";
  return null;
}

/** True when jog in `dir` would travel further into an active limit (matches control-api guards). */
export function isJogBlockedByTravelLimit(
  dir: "left" | "right",
  limits: TravelLimitSwitchState,
  mode?: LimitSwitchModeState,
): boolean {
  if (!limits.connected) return false;
  if (towardCenterJogDirection(mode) === dir) return false;
  if (dir === "left" && limits.limitLeftPressed) return true;
  if (dir === "right" && limits.limitRightPressed) return true;
  return false;
}

/** Active jog hold that must release because its direction hit a travel limit. */
export function shouldReleaseJogHoldForTravelLimit(
  holding: "left" | "right" | null,
  limits: TravelLimitSwitchState,
  mode?: LimitSwitchModeState,
): boolean {
  if (!holding) return false;
  return isJogBlockedByTravelLimit(holding, limits, mode);
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
export function isJogBlockedWhileLatched(
  dir: "left" | "right",
  mode: LimitSwitchModeState | undefined,
): boolean {
  const toward = towardCenterJogDirection(mode);
  if (!toward) return false;
  return dir !== toward;
}

export function isMoveTargetBlockedWhileLatched(
  targetCm: number,
  currentCm: number | undefined,
  mode: LimitSwitchModeState | undefined,
): boolean {
  if (!mode?.latched || !mode.side || currentCm === undefined || !Number.isFinite(currentCm)) {
    return false;
  }
  if (mode.side === "left" && targetCm < currentCm) return true;
  if (mode.side === "right" && targetCm > currentCm) return true;
  return false;
}

export function shouldReleaseJogHoldWhileLatched(
  holding: "left" | "right" | null,
  mode: LimitSwitchModeState | undefined,
): boolean {
  if (!holding) return false;
  return isJogBlockedWhileLatched(holding, mode);
}
