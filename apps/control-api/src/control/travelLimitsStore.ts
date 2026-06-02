import { cmToDisplayCounts, displayCountsToCm } from "../railPositionCm.js";
import type { TravelLimitsCm } from "./types.js";
import { teknicMeasuredToDisplayCounts } from "../helpers/physical/teknicDisplayCounts.js";

export type SymmetricTravelLimitsCm = {
  centerCm: number;
  halfSpanCm: number;
  leftCm: number;
  rightCm: number;
};

/** Per-backend software travel limits (display motor counts internally). */
export class TravelLimitsStore {
  private left: number | null = null;
  private right: number | null = null;

  getDisplayLimits(): { left: number | null; right: number | null } {
    return { left: this.left, right: this.right };
  }

  getTravelLimitsCm(): TravelLimitsCm {
    return {
      left: this.left != null ? displayCountsToCm(this.left) : null,
      right: this.right != null ? displayCountsToCm(this.right) : null,
    };
  }

  clear(): void {
    this.left = null;
    this.right = null;
  }

  syncFromMotorConnection(connected: boolean): void {
    if (!connected) this.clear();
  }

  setFromCm(limits: TravelLimitsCm): void {
    this.left = limits.left != null ? cmToDisplayCounts(limits.left) : null;
    this.right = limits.right != null ? cmToDisplayCounts(limits.right) : null;
  }

  recordFromTeknicMeasured(teknicMeasured: number, side: "left" | "right"): void {
    if (!Number.isFinite(teknicMeasured)) return;
    const d = teknicMeasuredToDisplayCounts(teknicMeasured);
    if (side === "left") this.left = d;
    else this.right = d;
  }

  setFromHoming(posAtLeftMotor: number, posAtRightMotor: number, zeroedAtMid: boolean): void {
    if (!Number.isFinite(posAtLeftMotor) || !Number.isFinite(posAtRightMotor)) {
      return;
    }
    if (zeroedAtMid) {
      const mid = (posAtLeftMotor + posAtRightMotor) / 2;
      this.left = mid - posAtLeftMotor;
      this.right = mid - posAtRightMotor;
      return;
    }
    this.left = teknicMeasuredToDisplayCounts(posAtLeftMotor);
    this.right = teknicMeasuredToDisplayCounts(posAtRightMotor);
  }

  setSymmetricAboutCm(centerCm: number, halfSpanCm: number): SymmetricTravelLimitsCm {
    if (!Number.isFinite(centerCm) || !Number.isFinite(halfSpanCm) || halfSpanCm <= 0) {
      throw new Error("Center position and switch distance must be finite; distance must be positive.");
    }
    const leftCm = centerCm - halfSpanCm;
    const rightCm = centerCm + halfSpanCm;
    this.left = cmToDisplayCounts(leftCm);
    this.right = cmToDisplayCounts(rightCm);
    return { centerCm, halfSpanCm, leftCm, rightCm };
  }
}
