import type { RailMachineState, TravelLimitsCm } from "../control/types.js";
import type { SymmetricTravelLimitsCm } from "../railTravelLimits.js";

export function travelLimitsAfterRecordSide(
  state: RailMachineState,
  side: "left" | "right",
): TravelLimitsCm {
  if (!state.connection.cart) {
    throw new Error("Motor is not connected.");
  }
  if (state.cart.positionCm == null) {
    throw new Error("Cart position unavailable.");
  }
  return {
    left: side === "left" ? state.cart.positionCm : state.cart.travelLimitsCm.left,
    right: side === "right" ? state.cart.positionCm : state.cart.travelLimitsCm.right,
  };
}

export function symmetricTravelLimitsFromPosition(
  positionCm: number,
  halfSpanCm: number,
): SymmetricTravelLimitsCm {
  if (!Number.isFinite(positionCm) || !Number.isFinite(halfSpanCm) || halfSpanCm <= 0) {
    throw new Error("Center position and switch distance must be finite; distance must be positive.");
  }
  const leftCm = positionCm - halfSpanCm;
  const rightCm = positionCm + halfSpanCm;
  return { centerCm: positionCm, halfSpanCm, leftCm, rightCm };
}

export function symmetricTravelLimitsCm(
  positionCm: number,
  halfSpanCm: number,
): TravelLimitsCm {
  const span = symmetricTravelLimitsFromPosition(positionCm, halfSpanCm);
  return { left: span.leftCm, right: span.rightCm };
}
