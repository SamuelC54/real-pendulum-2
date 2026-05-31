import type { GrpcBackendMode } from "./grpcRequestContext.js";
import {
  isMotionBlockedByLatch,
  motionLatchErrorMessage,
} from "./motionLatch.js";
import { createControlClient, createTwinControlBackend } from "./control/createControlClient.js";
import { cmPerSecToRpm, rpmToCmPerSec } from "./control/motionUnits.js";

export type TravelLimitSwitchState = {
  connected: boolean;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

export function clampJogRpmForTravelLimits(
  rpm: number,
  limits: TravelLimitSwitchState,
): number {
  if (rpm === 0 || !limits.connected) return rpm;
  if (limits.limitLeftPressed && rpm > 0) return 0;
  if (limits.limitRightPressed && rpm < 0) return 0;
  return rpm;
}

export function guardMoveAbsolutePositionCm(
  targetCm: number,
  limits: TravelLimitSwitchState,
  currentCm?: number,
): string | null {
  if (!limits.connected || currentCm === undefined || !Number.isFinite(currentCm)) {
    return null;
  }
  if (limits.limitLeftPressed && targetCm < currentCm) {
    return "Left travel limit is active — cannot move further left.";
  }
  if (limits.limitRightPressed && targetCm > currentCm) {
    return "Right travel limit is active — cannot move further right.";
  }
  return null;
}

function travelLimitJogErrorMessage(limits: TravelLimitSwitchState): string {
  if (limits.limitLeftPressed) {
    return "Left travel limit is active — cannot jog further left.";
  }
  if (limits.limitRightPressed) {
    return "Right travel limit is active — cannot jog further right.";
  }
  return "Travel limit active — jog blocked in that direction.";
}

export async function setJogCmPerSecRespectingTravelLimits(
  cmPerSec: number,
  mode: GrpcBackendMode,
  options?: { maxAccelerationRpmPerSec?: number },
): Promise<{ ok: boolean; error: string }> {
  if (isMotionBlockedByLatch()) {
    return { ok: false, error: motionLatchErrorMessage() };
  }
  const client = createControlClient(mode);
  const state = await client.getState();
  const rpm = cmPerSecToRpm(cmPerSec);
  const effective = clampJogRpmForTravelLimits(rpm, {
    connected: state.connection.sensor,
    limitLeftPressed: state.limitSwitch.leftPressed,
    limitRightPressed: state.limitSwitch.rightPressed,
  });
  if (rpm !== 0 && effective === 0) {
    return {
      ok: false,
      error: travelLimitJogErrorMessage({
        connected: state.connection.sensor,
        limitLeftPressed: state.limitSwitch.leftPressed,
        limitRightPressed: state.limitSwitch.rightPressed,
      }),
    };
  }
  return client.setJogCmPerSec(rpmToCmPerSec(effective), options);
}

export async function moveToPositionCmRespectingTravelLimits(
  positionCm: number,
  mode: GrpcBackendMode,
  opts?: {
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
    recovery?: boolean;
  },
): Promise<{ ok: boolean; error: string }> {
  if (!opts?.recovery) {
    if (isMotionBlockedByLatch()) {
      return { ok: false, error: motionLatchErrorMessage() };
    }
    const client = createControlClient(mode);
    const state = await client.getState();
    const currentCm = state.cart.positionCm ?? undefined;
    const travelGuard = guardMoveAbsolutePositionCm(
      positionCm,
      {
        connected: state.connection.sensor,
        limitLeftPressed: state.limitSwitch.leftPressed,
        limitRightPressed: state.limitSwitch.rightPressed,
      },
      currentCm,
    );
    if (travelGuard) return { ok: false, error: travelGuard };
  }
  return createControlClient(mode).moveToPositionCm(positionCm, opts);
}

export type RailMoveResult = { ok: boolean; error: string };

export type RailMoveForBackendResult =
  | RailMoveResult
  | { real: RailMoveResult; sim: RailMoveResult };

export async function moveToPositionCmForBackend(
  mode: GrpcBackendMode,
  positionCm: number,
  opts?: {
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
    recovery?: boolean;
  },
): Promise<RailMoveForBackendResult> {
  if (mode === "twin") {
    const { real, sim } = await createTwinControlBackend().moveToPositionCmTwin(positionCm, opts);
    return { real, sim };
  }
  return moveToPositionCmRespectingTravelLimits(positionCm, mode, opts);
}

export function assertRailMoveOk(move: RailMoveForBackendResult, label = "Motor"): void {
  if ("real" in move) {
    if (!move.real.ok) {
      throw new Error(move.real.error || `${label} rejected absolute move.`);
    }
    if (!move.sim.ok) {
      throw new Error(move.sim.error || "Sim rejected absolute move.");
    }
    return;
  }
  if (!move.ok) {
    throw new Error(move.error || `${label} rejected absolute move.`);
  }
}
