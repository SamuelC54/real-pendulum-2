/** Commanded jog magnitude used by the rail UI (rpm); sign comes from direction. */
export const JOG_RPM = 120;

/**
 * Default host **`Motion.AccLimit`** (RPM/s with `AccUnit` RPM_PER_SEC) for move-to-position UI — matches
 * **`TeknicCfg::kAccLimitRpmPerSec`** in `teknic_cfg.h` / DLL defaults.
 */
export const DEFAULT_PROFILE_ACC_RPM_PER_SEC = 1000;

export function jogRpmForDirection(dir: "left" | "right"): number {
  return dir === "left" ? JOG_RPM : -JOG_RPM;
}
