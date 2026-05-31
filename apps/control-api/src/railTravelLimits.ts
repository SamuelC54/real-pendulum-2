/**
 * Server-side **travel limit** positions in **display** counts (left switch vs right switch).
 * Used by the rail cart UI and move-to-position slider. Homing sets symmetric limits after
 * `ZeroMeasuredPosition` at rail center; manual capture records the current motor position when
 * each limit closes (rising edge), triggered from the web.
 */

import { cmToDisplayCounts } from "./railPositionCm.js";
import { teknicMeasuredToDisplayCounts } from "./helpers/physical/teknicDisplayCounts.js";

export type TravelLimitLeg = "physical" | "simulation";

type TravelLimitDisplays = {
  left: number | null;
  right: number | null;
};

const limitsPhysical: TravelLimitDisplays = { left: null, right: null };
const limitsSimulation: TravelLimitDisplays = { left: null, right: null };

function limitsFor(leg: TravelLimitLeg): TravelLimitDisplays {
  return leg === "simulation" ? limitsSimulation : limitsPhysical;
}

export type { TravelLimitDisplays };

export function getTravelLimitDisplays(leg: TravelLimitLeg = "physical"): TravelLimitDisplays {
  const a = limitsFor(leg);
  return { left: a.left, right: a.right };
}

export function clearTravelLimits(leg: TravelLimitLeg = "physical"): void {
  const a = limitsFor(leg);
  a.left = null;
  a.right = null;
}

/** Clears stored limits when the motor disconnects (same lifecycle as session rail bounds). */
export function syncTravelLimitsFromMotorConnection(
  connected: boolean,
  leg: TravelLimitLeg = "physical",
): void {
  if (!connected) clearTravelLimits(leg);
}

/**
 * After homing: `posAtLeft` / `posAtRight` are Teknic `PosnMeasured` when each switch tripped.
 * If the drive was zeroed at mid, store display limits at each stop after zero — **symmetric** about 0.
 * If not zeroed, use the same convention as live position: `display = -measured` at each stop.
 */
export function setTravelLimitsFromHoming(
  posAtLeftMotor: number,
  posAtRightMotor: number,
  zeroedAtMid: boolean,
  leg: TravelLimitLeg = "physical",
): void {
  if (!Number.isFinite(posAtLeftMotor) || !Number.isFinite(posAtRightMotor)) {
    return;
  }
  const a = limitsFor(leg);
  if (zeroedAtMid) {
    const mid = (posAtLeftMotor + posAtRightMotor) / 2;
    a.left = mid - posAtLeftMotor;
    a.right = mid - posAtRightMotor;
    return;
  }
  a.left = teknicMeasuredToDisplayCounts(posAtLeftMotor);
  a.right = teknicMeasuredToDisplayCounts(posAtRightMotor);
}

export type SymmetricTravelLimitsCm = {
  centerCm: number;
  halfSpanCm: number;
  leftCm: number;
  rightCm: number;
};

/** Set left/right travel stops symmetrically about `centerCm` (display rail coordinates). */
export function setTravelLimitsSymmetricAboutCm(
  centerCm: number,
  halfSpanCm: number,
  leg: TravelLimitLeg = "physical",
): SymmetricTravelLimitsCm {
  if (!Number.isFinite(centerCm) || !Number.isFinite(halfSpanCm) || halfSpanCm <= 0) {
    throw new Error("Center position and switch distance must be finite; distance must be positive.");
  }
  const leftCm = centerCm - halfSpanCm;
  const rightCm = centerCm + halfSpanCm;
  const a = limitsFor(leg);
  a.left = cmToDisplayCounts(leftCm);
  a.right = cmToDisplayCounts(rightCm);
  return { centerCm, halfSpanCm, leftCm, rightCm };
}

/** Set software travel limits directly in cm (ControlClient API). */
export function setTravelLimitsFromCm(
  limits: {
    left: number | null;
    right: number | null;
  },
  leg: TravelLimitLeg = "physical",
): void {
  const a = limitsFor(leg);
  a.left = limits.left != null ? cmToDisplayCounts(limits.left) : null;
  a.right = limits.right != null ? cmToDisplayCounts(limits.right) : null;
}

/** Snapshot current motor measured position into the given side (from limit switch hit). */
export function recordTravelLimitFromTeknicMeasured(
  teknicMeasured: number,
  side: "left" | "right",
  leg: TravelLimitLeg = "physical",
): void {
  if (!Number.isFinite(teknicMeasured)) return;
  const d = teknicMeasuredToDisplayCounts(teknicMeasured);
  const a = limitsFor(leg);
  if (side === "left") a.left = d;
  else a.right = d;
}

/** @internal Vitest */
export function resetTravelLimitsStateForTests(): void {
  limitsPhysical.left = null;
  limitsPhysical.right = null;
  limitsSimulation.left = null;
  limitsSimulation.right = null;
}
