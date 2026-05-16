import { config } from "@real-pendulum/app-config";

/** Display motor counts per cm — keep in sync with control-api `config.rail`. */
export function displayCountsPerCm(): number {
  return config.rail.displayCountsPerCm;
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
