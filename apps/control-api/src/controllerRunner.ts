/**
 * Runs a Python rail controller on the live plant: poll motor position, tick logic in
 * physics-sim, issue absolute profile moves when the controller requests them.
 */
import {
  physicsSimControllersStart,
  physicsSimControllersStop,
  physicsSimControllersTick,
  physicsSimRlStatus,
} from "@real-pendulum/physics-sim/client";
import { isMotionBlockedByLatch } from "./motionLatch.js";
import { moveToPositionCmRespectingTravelLimits } from "./railLimitGuards.js";
import { readMotorStatusPayload } from "./statusPayload.js";
import { isHardwareInferenceLoopRunning } from "./rlHardwareInference.js";

const TICK_MS = 200;
const ARRIVAL_TOLERANCE_CM = 0.5;

let loopTimer: ReturnType<typeof setInterval> | null = null;
let loopError: string | null = null;
let lastCommandedCm: number | null = null;
let controllerStartedAtSec: number | null = null;

function stopLoopTimer(): void {
  if (loopTimer != null) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  lastCommandedCm = null;
  controllerStartedAtSec = null;
}

export function getControllerLoopError(): string | null {
  return loopError;
}

export function isControllerLoopRunning(): boolean {
  return loopTimer != null;
}

async function assertMotorReady(): Promise<number> {
  const motor = await readMotorStatusPayload();
  if (!motor.connected) {
    throw new Error("Motor is not connected — connect on the Control tab first.");
  }
  if (motor.positionCm === undefined || !Number.isFinite(motor.positionCm)) {
    throw new Error("Motor position unavailable — home or zero the rail if needed.");
  }
  return motor.positionCm;
}

/** @returns true when the runner should exit (done, idle, latch, or error). */
async function controllerTick(): Promise<boolean> {
  try {
    if (isMotionBlockedByLatch()) {
      await stopControllerRunner();
      return true;
    }

    const positionCm = await assertMotorReady();
    const timeSec =
      controllerStartedAtSec != null
        ? Date.now() / 1000 - controllerStartedAtSec
        : Date.now() / 1000;

    const out = await physicsSimControllersTick({ positionCm, timeSec });

    if (out.done || out.idle) {
      await stopControllerRunner();
      return true;
    }

    if (out.positionCm !== undefined && Number.isFinite(out.positionCm)) {
      const target = out.positionCm;
      const needsMove =
        lastCommandedCm === null ||
        Math.abs(target - lastCommandedCm) > 1e-6 ||
        Math.abs(positionCm - target) > ARRIVAL_TOLERANCE_CM;

      if (needsMove) {
        const move = await moveToPositionCmRespectingTravelLimits(target, {
          maxVelocityRpm: out.maxVelocityRpm,
          maxAccelerationRpmPerSec: out.maxAccelerationRpmPerSec,
        });
        if (!move.ok) {
          throw new Error(move.error || "Motor rejected absolute move.");
        }
        lastCommandedCm = target;
      }
    }

    loopError = null;
    return false;
  } catch (e) {
    loopError = e instanceof Error ? e.message : String(e);
    stopLoopTimer();
    try {
      await physicsSimControllersStop();
    } catch {
      /* best effort */
    }
    return true;
  }
}

export async function startControllerRunner(
  id: string,
  params: Record<string, number>,
): Promise<void> {
  if (loopTimer != null) {
    throw new Error("A controller is already running.");
  }

  const rl = await physicsSimRlStatus();
  if (rl.training.active || rl.inference.active) {
    throw new Error("Stop RL training or inference before starting a controller.");
  }
  if (isHardwareInferenceLoopRunning()) {
    throw new Error("Stop hardware RL inference before starting a controller.");
  }

  loopError = null;
  lastCommandedCm = null;
  controllerStartedAtSec = Date.now() / 1000;

  await physicsSimControllersStart(id, params);
  await assertMotorReady();
  const finished = await controllerTick();
  if (finished || loopTimer != null) {
    return;
  }

  loopTimer = setInterval(() => {
    void controllerTick();
  }, TICK_MS);
}

export async function stopControllerRunner(): Promise<void> {
  stopLoopTimer();
  await physicsSimControllersStop();
}
