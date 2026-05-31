import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import { updateLimitSwitchState, updateMotorPositionForLatch } from "./motionLatch.js";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { motorStatusForClient, type MotorStatusForClient } from "./motorStatusApi.js";
import {
  getTravelLimitDisplays,
  syncTravelLimitsFromMotorConnection,
} from "./railTravelLimits.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

export async function readMotorStatusPayload(options?: {
  trackLatch?: boolean;
}): Promise<MotorStatusForClient> {
  try {
    const st = await motor.getMotorStatus();
    syncTravelLimitsFromMotorConnection(st.connected);
    const payload = motorStatusForClient({
      ...st,
      travelLimits: getTravelLimitDisplays(),
    });
    if (options?.trackLatch !== false) {
      updateMotorPositionForLatch(payload.positionCm);
    }
    return payload;
  } catch (e) {
    syncTravelLimitsFromMotorConnection(false);
    return motorStatusForClient({
      connected: false,
      commandedRpm: 0,
      detail: friendlyMotorError(e),
      measuredPosition: undefined,
      travelLimits: { left: null, right: null },
    });
  }
}

export type SensorStatusPayload = {
  connected: boolean;
  ledOn: boolean;
  detail: string;
  serialPort: string;
  encoderTicks: number;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

export async function readSensorStatusPayload(options?: {
  trackLatch?: boolean;
}): Promise<SensorStatusPayload> {
  try {
    const st = await sensor.getSensorStatus();
    if (options?.trackLatch !== false) {
      updateLimitSwitchState(st);
    }
    return st;
  } catch (e) {
    return {
      connected: false,
      ledOn: false,
      detail: friendlySensorError(e),
      serialPort: "",
      encoderTicks: 0,
      limitLeftPressed: false,
      limitRightPressed: false,
    };
  }
}
