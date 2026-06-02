import { config } from "@real-pendulum/app-config";
import { teknicMeasuredToDisplayCounts } from "./helpers/physical/teknicDisplayCounts.js";

/** Display motor counts per centimeter along the rail (`1 cm = N counts`). */
export function displayCountsPerCm(): number {
  return config.rail.displayCountsPerCm;
}

export function displayCountsToCm(displayCounts: number): number {
  return displayCounts / displayCountsPerCm();
}

export function cmToDisplayCounts(cm: number): number {
  return cm * displayCountsPerCm();
}

/** Teknic `PosnMeasured` → UI rail position in cm (same sign as historical display counts). */
export function teknicMeasuredToCm(teknicMeasured: number): number {
  return displayCountsToCm(teknicMeasuredToDisplayCounts(teknicMeasured));
}

/** UI rail position in cm → Teknic `PosnMeasured` counts for `MovePosnStart`. */
export function cmToTeknicMeasured(cm: number): number {
  return -cmToDisplayCounts(cm);
}

export function travelLimitsToCm(limits: {
  left: number | null;
  right: number | null;
}): { leftCm: number | null; rightCm: number | null } {
  return {
    leftCm: limits.left != null ? displayCountsToCm(limits.left) : null,
    rightCm: limits.right != null ? displayCountsToCm(limits.right) : null,
  };
}
