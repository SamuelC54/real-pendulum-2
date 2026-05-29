/**
 * Runs a Python rail controller on the live plant: poll motor position, tick logic in
 * physics-sim, issue absolute profile moves when the controller requests them.
 */
import {
  physicsSimControllersStart,
  physicsSimControllersStop,
  physicsSimControllersTick,
} from "@real-pendulum/physics-sim/client";
import type { GrpcBackendMode } from "./grpcRequestContext.js";
import { isMotionBlockedByLatch } from "./motionLatch.js";
import {
  assertRailMoveOk,
  moveToPositionCmForBackend,
} from "./railLimitGuards.js";
import { readMotorStatusPayload, readSensorStatusPayload } from "./statusPayload.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";

const TICK_MS = 200;
const LQR_TICK_MS = 50;
const ARRIVAL_TOLERANCE_CM = 0.5;

let activeControllerId: string | null = null;
let controllerBackendMode: GrpcBackendMode = "hardware";

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
  activeControllerId = null;
}

export function getControllerLoopError(): string | null {
  return loopError;
}

export function isControllerLoopRunning(): boolean {
  return loopTimer != null;
}

async function readControllerMotorPositionCm(): Promise<number> {
  const read = async (): Promise<number> => {
    const motor = await readMotorStatusPayload();
    if (!motor.connected) {
      throw new Error("Motor is not connected — connect on the Control tab first.");
    }
    if (motor.positionCm === undefined || !Number.isFinite(motor.positionCm)) {
      throw new Error("Motor position unavailable — home or zero the rail if needed.");
    }
    return motor.positionCm;
  };

  if (controllerBackendMode === "sim") {
    return withSimGrpc(read);
  }
  return withHardwareGrpc(read);
}

/** @returns true when the runner should exit (done, idle, latch, or error). */
async function controllerTick(): Promise<boolean> {
  try {
    if (isMotionBlockedByLatch()) {
      await stopControllerRunner();
      return true;
    }

    const positionCm = await readControllerMotorPositionCm();
    const timeSec =
      controllerStartedAtSec != null
        ? Date.now() / 1000 - controllerStartedAtSec
        : Date.now() / 1000;

    const tickState: {
      positionCm: number;
      timeSec: number;
      encoderTicks?: number;
    } = { positionCm, timeSec };

    if (activeControllerId === "lqr_position") {
      const sensor = await withHardwareGrpc(() => readSensorStatusPayload());
      if (!sensor.connected) {
        throw new Error(
          "Sensor board is not connected — LQR balance needs the pendulum encoder.",
        );
      }
      tickState.encoderTicks = sensor.encoderTicks;
    }

    const out = await physicsSimControllersTick(tickState);

    if (out.done || out.idle) {
      await stopControllerRunner();
      return true;
    }

    if (out.positionCm !== undefined && Number.isFinite(out.positionCm)) {
      const target = out.positionCm;
      const minDelta = out.minCommandDeltaCm ?? ARRIVAL_TOLERANCE_CM;
      const needsMove = out.streamPosition
        ? lastCommandedCm === null || Math.abs(target - lastCommandedCm) >= minDelta
        : lastCommandedCm === null ||
          Math.abs(target - lastCommandedCm) > 1e-6 ||
          Math.abs(positionCm - target) > ARRIVAL_TOLERANCE_CM;

      if (needsMove) {
        const move = await moveToPositionCmForBackend(controllerBackendMode, target, {
          maxVelocityRpm: out.maxVelocityRpm,
          maxAccelerationRpmPerSec: out.maxAccelerationRpmPerSec,
        });
        assertRailMoveOk(move);
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
  backendMode: GrpcBackendMode = "hardware",
): Promise<void> {
  if (loopTimer != null) {
    throw new Error("A controller is already running.");
  }

  loopError = null;
  lastCommandedCm = null;
  controllerStartedAtSec = Date.now() / 1000;
  controllerBackendMode = backendMode;

  await physicsSimControllersStart(id, params);
  activeControllerId = id;
  await readControllerMotorPositionCm();
  if (id === "lqr_position") {
    const sensor = await withHardwareGrpc(() => readSensorStatusPayload());
    if (!sensor.connected) {
      activeControllerId = null;
      controllerBackendMode = "hardware";
      await physicsSimControllersStop();
      throw new Error(
        "Connect the sensor board on the Control tab before starting LQR balance.",
      );
    }
  }
  const finished = await controllerTick();
  if (finished || loopTimer != null) {
    return;
  }

  const tickMs = id === "lqr_position" ? LQR_TICK_MS : TICK_MS;
  loopTimer = setInterval(() => {
    void controllerTick();
  }, tickMs);
}

export async function stopControllerRunner(): Promise<void> {
  stopLoopTimer();
  controllerBackendMode = "hardware";
  await physicsSimControllersStop();
}
