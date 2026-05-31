import {
  controllerServiceList,
  controllerServiceStatus,
  type ControllerMeta,
  type ControllerStatus,
} from "@real-pendulum/controller-service/client";
import type { ControlClient } from "./control/ControlClient.js";
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
  controlClient: ControlClient,
): Promise<ReturnType<typeof getControllerStatus>> {
  await startControllerRunner(id, params, controlClient);
  return getControllerStatus();
}

export async function stopController(): Promise<ReturnType<typeof getControllerStatus>> {
  await stopControllerRunner();
  return getControllerStatus();
}
