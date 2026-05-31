import { config, simulationGrpcBaseUrl } from "@real-pendulum/app-config";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";

/** Default simulation (motor + sensor on one host), when sim URLs are unset. */
export function defaultSimulationGrpcUrl(): string {
  return simulationGrpcBaseUrl();
}

export function resolveSimMotorGrpcUrl(): string {
  const raw = config.sim.motorSimGrpcUrl?.trim();
  if (raw) return motor.normalizeMotorGrpcBaseUrl(raw);
  return motor.normalizeMotorGrpcBaseUrl(defaultSimulationGrpcUrl());
}

export function resolveSimSensorGrpcUrl(): string {
  const raw = config.sim.sensorSimGrpcUrl?.trim();
  if (raw) return sensor.normalizeSensorGrpcBaseUrl(raw);
  const motorSim = config.sim.motorSimGrpcUrl?.trim();
  if (motorSim) return sensor.normalizeSensorGrpcBaseUrl(motorSim);
  return sensor.normalizeSensorGrpcBaseUrl(defaultSimulationGrpcUrl());
}
