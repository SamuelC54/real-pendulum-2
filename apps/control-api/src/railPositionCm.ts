import { teknicMeasuredToDisplayCounts } from "./teknicDisplayCounts.js";

/** Display motor counts per centimeter along the rail (`1 cm = N counts`). */
export function displayCountsPerCm(): number {
  const raw = process.env.RAIL_DISPLAY_COUNTS_PER_CM?.trim();
  if (!raw) return 232.8;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 232.8;
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

export type TravelLimitsCm = {
  leftCm: number | null;
  rightCm: number | null;
};

export function travelLimitsToCm(limits: {
  left: number | null;
  right: number | null;
}): TravelLimitsCm {
  return {
    leftCm: limits.left != null ? displayCountsToCm(limits.left) : null,
    rightCm: limits.right != null ? displayCountsToCm(limits.right) : null,
  };
}
