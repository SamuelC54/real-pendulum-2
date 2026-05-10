/**
 * Server-side **travel limit** positions in **display** counts (left switch vs right switch).
 * Used by the rail cart UI and move-to-position slider. Homing sets symmetric limits after
 * `ZeroMeasuredPosition` at rail center; manual capture records the current motor position when
 * each limit closes (rising edge), triggered from the web.
 */

import { teknicMeasuredToDisplayCounts } from "./teknicDisplayCounts.js";

let limitLeftDisplay: number | null = null;
let limitRightDisplay: number | null = null;

export type TravelLimitDisplays = {
  left: number | null;
  right: number | null;
};

export function getTravelLimitDisplays(): TravelLimitDisplays {
  return { left: limitLeftDisplay, right: limitRightDisplay };
}

export function clearTravelLimits(): void {
  limitLeftDisplay = null;
  limitRightDisplay = null;
}

/** Clears stored limits when the motor disconnects (same lifecycle as session rail bounds). */
export function syncTravelLimitsFromMotorConnection(connected: boolean): void {
  if (!connected) clearTravelLimits();
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
): void {
  if (!Number.isFinite(posAtLeftMotor) || !Number.isFinite(posAtRightMotor)) {
    return;
  }
  if (zeroedAtMid) {
    const mid = (posAtLeftMotor + posAtRightMotor) / 2;
    limitLeftDisplay = mid - posAtLeftMotor;
    limitRightDisplay = mid - posAtRightMotor;
    return;
  }
  limitLeftDisplay = teknicMeasuredToDisplayCounts(posAtLeftMotor);
  limitRightDisplay = teknicMeasuredToDisplayCounts(posAtRightMotor);
}

/** Snapshot current motor measured position into the given side (from limit switch hit). */
export function recordTravelLimitFromTeknicMeasured(teknicMeasured: number, side: "left" | "right"): void {
  if (!Number.isFinite(teknicMeasured)) return;
  const d = teknicMeasuredToDisplayCounts(teknicMeasured);
  if (side === "left") limitLeftDisplay = d;
  else limitRightDisplay = d;
}

/** @internal Vitest */
export function resetTravelLimitsStateForTests(): void {
  limitLeftDisplay = null;
  limitRightDisplay = null;
}
