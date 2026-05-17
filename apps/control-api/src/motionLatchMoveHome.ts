import { config } from "@real-pendulum/app-config";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { moveToPositionCmRespectingTravelLimits } from "./railLimitGuards.js";
import {
  runWithRecoveryMoveBypass,
  tryClearMotionLatchIfSafe,
} from "./motionLatch.js";
import { teknicMeasuredToCm } from "./railPositionCm.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

export type LatchMoveHomeResult =
  | { ok: true }
  | { ok: false; error: string }
  | { real: LatchMoveHomeResult; sim: LatchMoveHomeResult };

const DEFAULT_VEL_RPM = Math.min(120, Math.max(5, config.homing.jogRpm));
const DEFAULT_ACC_RPM_PER_SEC = 1000;
const HOME_POSITION_CM = 0;
const HOME_TOLERANCE_CM = 0.5;
const HOME_MOVE_TIMEOUT_MS = 120_000;
const HOME_POLL_MS = 50;
const HOME_SETTLE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMotorPositionCm(
  targetCm: number,
  opts: { toleranceCm: number; timeoutMs: number; pollMs: number },
): Promise<{ ok: boolean; error: string }> {
  const deadline = Date.now() + opts.timeoutMs;
  let reachedAt: number | undefined;

  while (Date.now() < deadline) {
    const st = await motor.getMotorStatus();
    if (!st.connected) {
      return { ok: false, error: "Motor disconnected during move to home." };
    }
    const cm =
      st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)
        ? teknicMeasuredToCm(st.measuredPosition)
        : undefined;
    if (cm !== undefined && Math.abs(cm - targetCm) <= opts.toleranceCm) {
      if (reachedAt === undefined) {
        reachedAt = Date.now();
      } else if (Date.now() - reachedAt >= HOME_SETTLE_MS) {
        return { ok: true, error: "" };
      }
    } else {
      reachedAt = undefined;
    }
    await sleep(opts.pollMs);
  }

  return { ok: false, error: "Timed out waiting for motor to reach home (0 cm)." };
}

async function moveToHomeCmWithRecovery(opts: {
  maxVelocityRpm: number;
  maxAccelerationRpmPerSec: number;
  recovery: true;
}): Promise<{ ok: boolean; error: string }> {
  const start = await moveToPositionCmRespectingTravelLimits(HOME_POSITION_CM, opts);
  if (!start.ok) return start;

  const waited = await waitForMotorPositionCm(HOME_POSITION_CM, {
    toleranceCm: HOME_TOLERANCE_CM,
    timeoutMs: HOME_MOVE_TIMEOUT_MS,
    pollMs: HOME_POLL_MS,
  });
  if (!waited.ok) return waited;

  try {
    const limits = await sensor.getSensorStatus();
    const st = await motor.getMotorStatus();
    const cm =
      st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)
        ? teknicMeasuredToCm(st.measuredPosition)
        : undefined;
    tryClearMotionLatchIfSafe(cm, limits);
  } catch {
    /* sensor/motor offline — latch stays until operator releases */
  }

  return { ok: true, error: "" };
}

export async function moveHomeWhileLatched(
  mode: GrpcBackendMode,
  options?: {
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
  },
): Promise<LatchMoveHomeResult> {
  const moveOpts = {
    maxVelocityRpm: options?.maxVelocityRpm ?? DEFAULT_VEL_RPM,
    maxAccelerationRpmPerSec:
      options?.maxAccelerationRpmPerSec ?? DEFAULT_ACC_RPM_PER_SEC,
    recovery: true as const,
  };

  return runWithRecoveryMoveBypass(async () => {
    if (mode === "twin") {
      const [real, sim] = await Promise.all([
        withHardwareGrpc(() => moveToHomeCmWithRecovery(moveOpts)),
        withSimGrpc(() => moveToHomeCmWithRecovery(moveOpts)),
      ]);
      return { real, sim };
    }

    const run = () => moveToHomeCmWithRecovery(moveOpts);
    if (mode === "sim") {
      return withSimGrpc(run);
    }
    return withHardwareGrpc(run);
  });
}
