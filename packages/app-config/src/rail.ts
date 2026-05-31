import { config } from "./config.js";

/** Display motor counts per centimeter (`config.rail.displayCountsPerCm`). */
export function displayCountsPerCm(): number {
  return config.rail.displayCountsPerCm;
}

/**
 * Teknic/display scale shared by hardware status and simulation.
 * Plant `xM` (m) → display counts = `xM / metersPerDisplayCount` → cm = display / {@link displayCountsPerCm}.
 */
export function metersPerDisplayCount(): number {
  const cpc = displayCountsPerCm();
  if (!Number.isFinite(cpc) || cpc <= 0) {
    throw new Error("config.rail.displayCountsPerCm must be a positive finite number.");
  }
  return 1 / (cpc * 100);
}
