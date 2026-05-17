import {
  physicsSimRlInferenceStart,
  physicsSimRlInferenceStop,
  physicsSimRlStatus,
  physicsSimRlTrainStart,
  physicsSimRlTrainStop,
  type PhysicsSimRlStatus,
} from "@real-pendulum/physics-sim/client";

export type { PhysicsSimRlStatus };

export async function getRlStatus(): Promise<PhysicsSimRlStatus> {
  return physicsSimRlStatus();
}

export async function startRlTraining(options: {
  totalTimesteps?: number;
  saveEvery?: number;
  nEnvs?: number;
  task?: "balance" | "center";
}): Promise<PhysicsSimRlStatus> {
  return physicsSimRlTrainStart(options);
}

export async function stopRlTraining(): Promise<PhysicsSimRlStatus> {
  return physicsSimRlTrainStop();
}

export async function startRlInference(generation: number): Promise<PhysicsSimRlStatus> {
  return physicsSimRlInferenceStart(generation);
}

export async function stopRlInference(): Promise<PhysicsSimRlStatus> {
  return physicsSimRlInferenceStop();
}
