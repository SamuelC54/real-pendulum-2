import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { withGrpcBackendMode } from "./grpcRequestContext.js";
import { resolveSimMotorGrpcUrl, resolveSimSensorGrpcUrl } from "./grpcSimDefaults.js";

/** Production motor + sensor gRPC targets from `config` (hardware mode). */
export function withHardwareGrpc<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const motorUrl = motor.defaultMotorGrpcUrl();
  const sensorUrl = sensor.defaultSensorGrpcUrl();
  return motor.withMotorGrpcBaseUrl(motorUrl, () =>
    sensor.withSensorGrpcBaseUrl(sensorUrl, () => fn()),
  );
}

/** Simulated plant (coupled sim motor + sensor sharing physics state). */
export function withSimGrpc<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const motorUrl = resolveSimMotorGrpcUrl();
  const sensorUrl = resolveSimSensorGrpcUrl();
  return withGrpcBackendMode("sim", () =>
    motor.withMotorGrpcBaseUrl(motorUrl, () =>
      sensor.withSensorGrpcBaseUrl(sensorUrl, () => fn()),
    ),
  );
}
