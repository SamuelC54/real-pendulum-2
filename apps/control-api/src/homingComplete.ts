import * as motor from "@real-pendulum/physical-motor-service/sdk";
import type { RailHomingResult } from "./homing.js";
import { homingResultForClient, type RailHomingResultForClient } from "./homingApi.js";
import { setTravelLimitsFromHoming } from "./railTravelLimits.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

export type HomingTickComplete = {
  posAtLeft: number;
  posAtRight: number;
  motorSpanCounts: number;
  midMotorPosition: number;
  zeroMotorAtMid: boolean;
};

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
  backendMode: GrpcBackendMode,
): Promise<RailHomingResultForClient> {
  const { posAtLeft, posAtRight, zeroMotorAtMid } = payload;
  const span = Math.abs(posAtRight - posAtLeft);
  const mid = (posAtLeft + posAtRight) / 2;

  let motorPositionZeroedAtMid: boolean | undefined;
  if (zeroMotorAtMid && backendMode !== "sim") {
    const r = await motor.zeroMeasuredPosition();
    motorPositionZeroedAtMid = r.ok;
    if (r.ok) {
      log.push("Teknic measured position zeroed at rail center.");
    } else {
      log.push(`Warning: motor zero at mid failed: ${r.error}`);
    }
  }

  setTravelLimitsFromHoming(posAtLeft, posAtRight, motorPositionZeroedAtMid === true);

  const result: RailHomingResult = {
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
  const result: RailHomingResult = {
    ok: false,
    error,
    motorAbsRevolutions,
    log,
  };
  lastHomingResult = homingResultForClient(result);
  return lastHomingResult;
}
