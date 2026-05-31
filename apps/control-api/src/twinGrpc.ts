import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";

/** Run with production motor + sensor gRPC URLs (hardware / twin physical path). */
export function withHardwareGrpc<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const motorUrl = motor.defaultMotorGrpcUrl();
  const sensorUrl = sensor.defaultSensorGrpcUrl();
  return motor.withMotorGrpcBaseUrl(motorUrl, () =>
    sensor.withSensorGrpcBaseUrl(sensorUrl, fn),
  );
}
