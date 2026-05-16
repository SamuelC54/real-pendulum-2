import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
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

export async function readMotorStatusPayload(): Promise<MotorStatusForClient> {
  try {
    const st = await motor.getMotorStatus();
    syncTravelLimitsFromMotorConnection(st.connected);
    return motorStatusForClient({
      ...st,
      travelLimits: getTravelLimitDisplays(),
    });
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

export async function readSensorStatusPayload(): Promise<SensorStatusPayload> {
  try {
    return await sensor.getSensorStatus();
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
