import { config } from "@real-pendulum/app-config";
import { createControlClient } from "./control/createControlClient.js";
import { moveToPositionCmRespectingTravelLimits } from "./railLimitGuards.js";
import {
  runWithRecoveryMoveBypass,
  tryClearMotionLatchIfSafe,
} from "./motionLatch.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

export type LatchMoveHomeLeafResult =
  | { ok: true }
  | { ok: false; error: string };

export type LatchMoveHomeResult =
  | LatchMoveHomeLeafResult
  | { real: LatchMoveHomeLeafResult; sim: LatchMoveHomeLeafResult };

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

async function waitForHomePosition(
  mode: GrpcBackendMode,
  targetCm: number,
  opts: { toleranceCm: number; timeoutMs: number; pollMs: number },
): Promise<{ ok: boolean; error: string }> {
  const deadline = Date.now() + opts.timeoutMs;
  let reachedAt: number | undefined;

  while (Date.now() < deadline) {
    const state = await createControlClient(mode).getState();
    if (!state.connection.cart) {
      return { ok: false, error: "Motor disconnected during move to home." };
    }
    const cm = state.cart.positionCm ?? undefined;
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

async function moveToHomeCmWithRecovery(
  mode: GrpcBackendMode,
  opts: {
    maxVelocityRpm: number;
    maxAccelerationRpmPerSec: number;
    recovery: true;
  },
): Promise<{ ok: boolean; error: string }> {
  const start = await moveToPositionCmRespectingTravelLimits(HOME_POSITION_CM, mode, opts);
  if (!start.ok) return start;

  const waited = await waitForHomePosition(mode, HOME_POSITION_CM, {
    toleranceCm: HOME_TOLERANCE_CM,
    timeoutMs: HOME_MOVE_TIMEOUT_MS,
    pollMs: HOME_POLL_MS,
  });
  if (!waited.ok) return waited;

  try {
    const state = await createControlClient(mode).getState();
    tryClearMotionLatchIfSafe(state.cart.positionCm ?? undefined, {
      connected: state.connection.sensor,
      limitLeftPressed: state.limitSwitch.leftPressed,
      limitRightPressed: state.limitSwitch.rightPressed,
    });
  } catch {
    /* offline — latch stays */
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
        moveToHomeCmWithRecovery("hardware", moveOpts),
        moveToHomeCmWithRecovery("sim", moveOpts),
      ]);
      return { real, sim };
    }
    return moveToHomeCmWithRecovery(mode, moveOpts);
  });
}
