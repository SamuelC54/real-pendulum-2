import { config } from "@real-pendulum/app-config";
import { rpmToCmPerSec } from "@real-pendulum/physical-motor-service/sdk";
import { getControlBackend } from "../control/getControlBackend.js";
import type { ControlMode } from "../control/types.js";
import { railStateForMode } from "../control/types.js";
import { runWithRecoveryBypass, tryClearIfSafe } from "./state.js";
import { runOnTwinLegs } from "./twinLegs.js";

export type MoveHomeLeafResult = { ok: true } | { ok: false; error: string };

export type MoveHomeResult =
  | MoveHomeLeafResult
  | { real: MoveHomeLeafResult; sim: MoveHomeLeafResult };

const DEFAULT_VEL_CM_PER_SEC = Math.abs(
  rpmToCmPerSec(Math.min(120, Math.max(5, config.homing.jogRpm))),
);
const DEFAULT_ACC_CM_PER_SEC2 = Math.abs(rpmToCmPerSec(1000));
const HOME_CM = 0;
const HOME_TOLERANCE_CM = 0.5;
const HOME_TIMEOUT_MS = 120_000;
const HOME_POLL_MS = 50;
const HOME_SETTLE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHome(
  mode: Exclude<ControlMode, "twin">,
  targetCm: number,
): Promise<{ ok: boolean; error: string }> {
  const deadline = Date.now() + HOME_TIMEOUT_MS;
  let reachedAt: number | undefined;

  while (Date.now() < deadline) {
    const state = railStateForMode(await getControlBackend(mode).getState(), mode);
    if (!state.connection.cart) {
      return { ok: false, error: "Motor disconnected during move to home." };
    }
    const cm = state.cart.positionCm ?? undefined;
    if (cm !== undefined && Math.abs(cm - targetCm) <= HOME_TOLERANCE_CM) {
      if (reachedAt === undefined) {
        reachedAt = Date.now();
      } else if (Date.now() - reachedAt >= HOME_SETTLE_MS) {
        return { ok: true, error: "" };
      }
    } else {
      reachedAt = undefined;
    }
    await sleep(HOME_POLL_MS);
  }

  return { ok: false, error: "Timed out waiting for motor to reach home (0 cm)." };
}

async function moveToHome(
  mode: Exclude<ControlMode, "twin">,
  opts: { maxVelocityCmPerSec: number; maxAccelerationCmPerSec2: number },
): Promise<{ ok: boolean; error: string }> {
  const start = await getControlBackend(mode).moveToPositionCm(HOME_CM, {
    ...opts,
    recovery: true,
  });
  if (!start.ok) return start;

  const waited = await waitForHome(mode, HOME_CM);
  if (!waited.ok) return waited;

  try {
    const state = railStateForMode(await getControlBackend(mode).getState(), mode);
    tryClearIfSafe(
      state.cart.positionCm ?? undefined,
      {
        connected: state.connection.sensor,
        limitLeftPressed: state.limitSwitch.leftPressed,
        limitRightPressed: state.limitSwitch.rightPressed,
      },
      state.cart.travelLimitsCm,
    );
  } catch {
    /* offline — latch stays */
  }

  return { ok: true, error: "" };
}

export async function moveHomeWhileLatched(
  mode: ControlMode,
  options?: {
    maxVelocityCmPerSec?: number;
    maxAccelerationCmPerSec2?: number;
  },
): Promise<MoveHomeResult> {
  const moveOpts = {
    maxVelocityCmPerSec: options?.maxVelocityCmPerSec ?? DEFAULT_VEL_CM_PER_SEC,
    maxAccelerationCmPerSec2: options?.maxAccelerationCmPerSec2 ?? DEFAULT_ACC_CM_PER_SEC2,
  };

  return runWithRecoveryBypass(() => runOnTwinLegs(mode, (leg) => moveToHome(leg, moveOpts)));
}
