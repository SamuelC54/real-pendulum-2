/**
 * UI convention for rail position: **left along the rail → negative counts**, **right → positive**
 * (Teknic `PosnMeasured` sign may be the opposite).
 */
export function motorCountsForDisplay(
  teknicMeasured: number | undefined,
): number | undefined {
  if (teknicMeasured === undefined || !Number.isFinite(teknicMeasured)) {
    return undefined;
  }
  return -teknicMeasured;
}

/** Slider / rail span when both switch-side travel limits are known (control-api `travelLimits`). */
export function boundsFromTravelSwitchDisplays(
  left: number | null | undefined,
  right: number | null | undefined,
): { min: number; max: number } | null {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  return {
    min: Math.min(left, right),
    max: Math.max(left, right),
  };
}
