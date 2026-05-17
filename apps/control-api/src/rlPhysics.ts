import {
  physicsSimRlInferenceStart,
  physicsSimRlInferenceStop,
  physicsSimRlStatus,
  physicsSimRlTrainStart,
  physicsSimRlTrainStop,
  type PhysicsSimRlStatus,
} from "@real-pendulum/physics-sim/client";
import { getHardwareInferenceLoopError } from "./rlHardwareInference.js";

export type { PhysicsSimRlStatus };

export async function getRlStatus(): Promise<PhysicsSimRlStatus> {
  const status = await physicsSimRlStatus();
  const loopErr = getHardwareInferenceLoopError();
  if (loopErr && status.inference.target === "hardware") {
    return {
      ...status,
      inference: { ...status.inference, error: loopErr, active: false },
    };
  }
  return status;
}

export async function startRlTraining(options: {
  totalTimesteps?: number;
  saveEvery?: number;
  nEnvs?: number;
}): Promise<PhysicsSimRlStatus> {
  return physicsSimRlTrainStart(options);
}

export async function stopRlTraining(): Promise<PhysicsSimRlStatus> {
  return physicsSimRlTrainStop();
}

export async function startRlInference(
  generation: number,
  target: "sim" | "hardware" = "sim",
): Promise<PhysicsSimRlStatus> {
  if (target === "hardware") {
    const { startHardwareInference } = await import("./rlHardwareInference.js");
    await startHardwareInference(generation);
    return getRlStatus();
  }
  return physicsSimRlInferenceStart(generation, { target: "sim" });
}

export async function stopRlInference(): Promise<PhysicsSimRlStatus> {
  const { stopHardwareInference, isHardwareInferenceLoopRunning } = await import(
    "./rlHardwareInference.js"
  );
  if (isHardwareInferenceLoopRunning()) {
    await stopHardwareInference();
  } else {
    await physicsSimRlInferenceStop();
  }
  return getRlStatus();
}
