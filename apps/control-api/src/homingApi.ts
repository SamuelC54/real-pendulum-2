import type { RailHomingResult } from "./homing.js";
import { displayCountsToCm, teknicMeasuredToCm } from "./railPositionCm.js";

/** Homing result exposed on control-api tRPC (rail positions in cm). */
export type RailHomingResultForClient = Omit<
  RailHomingResult,
  "motorPositionAtLeftLimit" | "motorPositionAtRightLimit" | "motorSpanCounts" | "midMotorPosition"
> & {
  motorPositionAtLeftLimitCm?: number;
  motorPositionAtRightLimitCm?: number;
  motorSpanCm?: number;
  midPositionCm?: number;
};

export function homingResultForClient(r: RailHomingResult): RailHomingResultForClient {
  const {
    motorPositionAtLeftLimit,
    motorPositionAtRightLimit,
    motorSpanCounts,
    midMotorPosition,
    ...rest
  } = r;
  const leftCm =
    motorPositionAtLeftLimit != null ? teknicMeasuredToCm(motorPositionAtLeftLimit) : undefined;
  const rightCm =
    motorPositionAtRightLimit != null ? teknicMeasuredToCm(motorPositionAtRightLimit) : undefined;
  return {
    ...rest,
    motorPositionAtLeftLimitCm: leftCm,
    motorPositionAtRightLimitCm: rightCm,
    motorSpanCm:
      motorSpanCounts != null
        ? displayCountsToCm(motorSpanCounts)
        : leftCm != null && rightCm != null
          ? Math.abs(rightCm - leftCm)
          : undefined,
    midPositionCm: midMotorPosition != null ? teknicMeasuredToCm(midMotorPosition) : undefined,
  };
}
