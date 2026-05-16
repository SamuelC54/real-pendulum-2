import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";

/** Same default listen port as **`serveCoupledSim`** / **`SIM_COUPLED_GRPC_PORT`**. */
function coupledSimPort(): number {
  // 58870: many Windows builds exclude 50xxx (bind EACCES on e.g. 50070).
  const n = Number(process.env.SIM_COUPLED_GRPC_PORT ?? "58870");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 58870;
}

/** Default coupled sim (motor + sensor on one host), when sim env URLs are unset. */
export function defaultCoupledSimGrpcUrl(): string {
  return `http://127.0.0.1:${coupledSimPort()}`;
}

export function resolveSimMotorGrpcUrl(): string {
  const raw = process.env.MOTOR_SIM_GRPC_URL?.trim();
  if (raw) return motor.normalizeMotorGrpcBaseUrl(raw);
  return motor.normalizeMotorGrpcBaseUrl(defaultCoupledSimGrpcUrl());
}

export function resolveSimSensorGrpcUrl(): string {
  const raw = process.env.SENSOR_SIM_GRPC_URL?.trim();
  if (raw) return sensor.normalizeSensorGrpcBaseUrl(raw);
  const motorSim = process.env.MOTOR_SIM_GRPC_URL?.trim();
  if (motorSim) return sensor.normalizeSensorGrpcBaseUrl(motorSim);
  return sensor.normalizeSensorGrpcBaseUrl(defaultCoupledSimGrpcUrl());
}
