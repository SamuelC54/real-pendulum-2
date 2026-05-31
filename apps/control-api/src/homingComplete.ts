import * as motor from "@real-pendulum/physical-motor-service/sdk";
import type { ControlClient } from "./control/ControlClient.js";
import { displayCountsToCm, teknicMeasuredToCm } from "./railPositionCm.js";
import { setTravelLimitsFromHoming } from "./railTravelLimits.js";

export type HomingTickComplete = {
  posAtLeft: number;
  posAtRight: number;
  motorSpanCounts: number;
  midMotorPosition: number;
  zeroMotorAtMid: boolean;
};

/** Raw homing payload from controller-service tick (Teknic counts). */
type RailHomingResultRaw = {
  ok: boolean;
  error?: string;
  motorPositionAtLeftLimit?: number;
  motorPositionAtRightLimit?: number;
  motorSpanCounts?: number;
  midMotorPosition?: number;
  motorPositionZeroedAtMid?: boolean;
  motorAbsRevolutions?: number;
  log: string[];
};

/** Homing result on tRPC `controllers.status` (rail positions in cm). */
export type RailHomingResultForClient = Omit<
  RailHomingResultRaw,
  "motorPositionAtLeftLimit" | "motorPositionAtRightLimit" | "motorSpanCounts" | "midMotorPosition"
> & {
  motorPositionAtLeftLimitCm?: number;
  motorPositionAtRightLimitCm?: number;
  motorSpanCm?: number;
  midPositionCm?: number;
};

function homingResultForClient(r: RailHomingResultRaw): RailHomingResultForClient {
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

let lastHomingResult: RailHomingResultForClient | null = null;

export function getLastHomingResult(): RailHomingResultForClient | null {
  return lastHomingResult;
}

export function clearLastHomingResultForTests(): void {
  lastHomingResult = null;
}

export async function completeHomingFromTick(
  payload: HomingTickComplete,
  log: string[],
  motorAbsRevolutions: number | undefined,
  controlClient: ControlClient,
): Promise<RailHomingResultForClient> {
  const { posAtLeft, posAtRight, zeroMotorAtMid } = payload;
  const span = Math.abs(posAtRight - posAtLeft);
  const mid = (posAtLeft + posAtRight) / 2;
  const mode = controlClient.mode;

  let motorPositionZeroedAtMid: boolean | undefined;
  if (zeroMotorAtMid && mode !== "simulation") {
    const r = await motor.zeroMeasuredPosition();
    motorPositionZeroedAtMid = r.ok;
    if (r.ok) {
      log.push("Teknic measured position zeroed at rail center.");
    } else {
      log.push(`Warning: motor zero at mid failed: ${r.error}`);
    }
  }

  setTravelLimitsFromHoming(
    posAtLeft,
    posAtRight,
    motorPositionZeroedAtMid === true,
    mode === "simulation" ? "simulation" : "physical",
  );

  const result: RailHomingResultRaw = {
    ok: true,
    motorPositionAtLeftLimit: posAtLeft,
    motorPositionAtRightLimit: posAtRight,
    motorSpanCounts: span,
    midMotorPosition: mid,
    motorPositionZeroedAtMid,
    motorAbsRevolutions,
    log,
  };
  lastHomingResult = homingResultForClient(result);
  return lastHomingResult;
}

export async function completeHomingFailure(
  error: string,
  log: string[],
  motorAbsRevolutions: number | undefined,
): Promise<RailHomingResultForClient> {
  const result: RailHomingResultRaw = {
    ok: false,
    error,
    motorAbsRevolutions,
    log,
  };
  lastHomingResult = homingResultForClient(result);
  return lastHomingResult;
}
