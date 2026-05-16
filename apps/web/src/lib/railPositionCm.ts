/** Display motor counts per cm — keep in sync with control-api `RAIL_DISPLAY_COUNTS_PER_CM`. */
export function displayCountsPerCm(): number {
  const raw = import.meta.env.VITE_RAIL_DISPLAY_COUNTS_PER_CM?.trim();
  if (!raw) return 232.8;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 232.8;
}

/** Slider / rail span when both switch-side travel limits are known (`travelLimits` in cm). */
export function boundsFromTravelLimitsCm(
  leftCm: number | null | undefined,
  rightCm: number | null | undefined,
): { min: number; max: number } | null {
  if (leftCm == null || rightCm == null || !Number.isFinite(leftCm) || !Number.isFinite(rightCm)) {
    return null;
  }
  return {
    min: Math.min(leftCm, rightCm),
    max: Math.max(leftCm, rightCm),
  };
}
