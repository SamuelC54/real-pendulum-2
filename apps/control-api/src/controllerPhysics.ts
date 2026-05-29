import {
  physicsSimControllersList,
  physicsSimControllersStatus,
  type PhysicsSimControllerMeta,
  type PhysicsSimControllerStatus,
} from "@real-pendulum/physics-sim/client";
import {
  getControllerLoopError,
  isControllerLoopRunning,
  startControllerRunner,
  stopControllerRunner,
} from "./controllerRunner.js";

export type { PhysicsSimControllerMeta, PhysicsSimControllerStatus };

export async function listControllers(): Promise<PhysicsSimControllerMeta[]> {
  return physicsSimControllersList();
}

export async function getControllerStatus(): Promise<PhysicsSimControllerStatus> {
  const status = await physicsSimControllersStatus();
  const loopErr = getControllerLoopError();
  return {
    ...status,
    active: status.active || isControllerLoopRunning(),
    error: loopErr ?? status.error,
  };
}

export async function startController(
  id: string,
  params: Record<string, number>,
): Promise<PhysicsSimControllerStatus> {
  await startControllerRunner(id, params);
  return getControllerStatus();
}

export async function stopController(): Promise<PhysicsSimControllerStatus> {
  await stopControllerRunner();
  return getControllerStatus();
}
