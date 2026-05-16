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
