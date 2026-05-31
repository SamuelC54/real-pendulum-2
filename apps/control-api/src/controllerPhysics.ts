import { config } from "@real-pendulum/app-config";
import {
  controllerServiceList,
  controllerServiceStatus,
  type ControllerMeta,
  type ControllerStatus,
} from "@real-pendulum/controller-service/client";
import type { GrpcBackendMode } from "./grpcRequestContext.js";
import {
  getControllerLoopError,
  isControllerLoopRunning,
  startControllerRunner,
  stopControllerRunner,
} from "./controllerRunner.js";
import { getLastHomingResult } from "./homingComplete.js";

export type { ControllerMeta, ControllerStatus };

export async function listControllers(): Promise<ControllerMeta[]> {
  return controllerServiceList();
}

export async function getControllerStatus(): Promise<
  ControllerStatus & { homingResult?: ReturnType<typeof getLastHomingResult> }
> {
  const status = await controllerServiceStatus();
  const loopErr = getControllerLoopError();
  return {
    ...status,
    active: status.active || isControllerLoopRunning(),
    error: loopErr ?? status.error,
    homingResult: getLastHomingResult(),
  };
}

export async function startController(
  id: string,
  params: Record<string, number>,
  backendMode: GrpcBackendMode = "hardware",
): Promise<ReturnType<typeof getControllerStatus>> {
  await startControllerRunner(id, params, backendMode);
  return getControllerStatus();
}

export async function stopController(): Promise<ReturnType<typeof getControllerStatus>> {
  await stopControllerRunner();
  return getControllerStatus();
}

export function defaultHomingControllerParams(): Record<string, number> {
  const h = config.homing;
  return {
    jogRpm: h.jogRpm,
    midPositionTolerance: h.midPositionTolerance,
    approachPosition: h.approachPosition,
    approachRpm: h.approachRpm,
    zeroMotorAtMid: h.zeroMotorPositionAtMid ? 1 : 0,
    minTravelForLimitCounts: h.minTravelForLimitCounts,
    phaseTimeoutSec: h.phaseTimeoutMs / 1000,
  };
}
