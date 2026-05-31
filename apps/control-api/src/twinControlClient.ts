import { createTwinControlBackend } from "./control/createControlClient.js";
import {
  motorStatusFromRailState,
  sensorStatusFromRailState,
} from "./control/mappers/statusMappers.js";
import type { MotorStatusForClient } from "./motorStatusApi.js";
import type { SensorStatusPayload } from "./statusPayload.js";

export async function twinMotorStatus(): Promise<{
  real: MotorStatusForClient;
  sim: MotorStatusForClient;
}> {
  const twin = createTwinControlBackend();
  const [real, sim] = await Promise.all([
    twin.getPhysicalState(),
    twin.getSimulationState(),
  ]);
  return {
    real: motorStatusFromRailState(real),
    sim: motorStatusFromRailState(sim),
  };
}

export async function twinSensorStatus(): Promise<{
  real: SensorStatusPayload;
  sim: SensorStatusPayload;
}> {
  const twin = createTwinControlBackend();
  const [real, sim] = await Promise.all([
    twin.getPhysicalState(),
    twin.getSimulationState(),
  ]);
  return {
    real: sensorStatusFromRailState(real),
    sim: sensorStatusFromRailState(sim),
  };
}

export { createTwinControlBackend };
