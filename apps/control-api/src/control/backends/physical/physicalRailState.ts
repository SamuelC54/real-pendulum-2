import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import {
  getLimitSwitchModeStatus,
  updateLimitSwitchState,
  updateMotorPosition,
} from "../../../limitSwitchMode/index.js";
import { friendlyMotorGrpcError } from "../../../helpers/physical/motorErrors.js";
import { friendlySensorGrpcError } from "../../../helpers/physical/sensorErrors.js";
import { encoderTicksPerRadian } from "../../../helpers/physical/pendulumEncoder.js";
import { teknicMeasuredToCm } from "../../../railPositionCm.js";
import type { RailMachineState, TravelLimitsCm } from "../../types.js";

export type PhysicalMotorSnapshot = Awaited<ReturnType<typeof motor.getMotorStatus>>;
export type PhysicalSensorSnapshot = Awaited<ReturnType<typeof sensor.getSensorStatus>>;

function deriveMachineStatus(
  cartConnected: boolean,
  sensorConnected: boolean,
): RailMachineState["status"] {
  if (!cartConnected && !sensorConnected) return "disconnected";
  if (getLimitSwitchModeStatus().latched) return "latched";
  return "idle";
}

/** Build {@link RailMachineState} from gRPC motor/sensor status (unary or stream). */
export function buildPhysicalRailState(
  motorSt: PhysicalMotorSnapshot | null,
  sensorSt: PhysicalSensorSnapshot | null,
  travelLimitsCm: TravelLimitsCm,
  errors: { motor?: string; sensor?: string } = {},
): RailMachineState {
  let cartConnected = false;
  let sensorConnected = false;
  let positionCm: number | null = null;
  let commandedCmPerSec = 0;
  let detail = errors.motor;
  let angleDeg = 0;
  let ledOn = false;
  let leftPressed = false;
  let rightPressed = false;
  let encoderTicks = 0;

  if (motorSt) {
    cartConnected = motorSt.connected;
    commandedCmPerSec = motorSt.commandedCmPerSec;
    if (motorSt.measuredPosition !== undefined && Number.isFinite(motorSt.measuredPosition)) {
      positionCm = teknicMeasuredToCm(motorSt.measuredPosition);
      updateMotorPosition(positionCm, travelLimitsCm);
    }
  }

  if (sensorSt) {
    sensorConnected = sensorSt.connected;
    ledOn = sensorSt.ledOn;
    leftPressed = sensorSt.limitLeftPressed;
    rightPressed = sensorSt.limitRightPressed;
    encoderTicks = sensorSt.encoderTicks;
    updateLimitSwitchState(sensorSt);
    if (!detail && errors.sensor) {
      detail = errors.sensor;
    }
  } else if (!detail && errors.sensor) {
    detail = errors.sensor;
  }

  const ticksPerRad = encoderTicksPerRadian();
  if (sensorConnected && ticksPerRad > 0) {
    angleDeg = (encoderTicks / ticksPerRad) * (180 / Math.PI);
  }

  return {
    status: deriveMachineStatus(cartConnected, sensorConnected),
    connection: { cart: cartConnected, sensor: sensorConnected },
    cart: {
      positionCm,
      commandedCmPerSec,
      travelLimitsCm: { ...travelLimitsCm },
    },
    pendulum: { angleDeg, encoderTicks },
    led: { on: ledOn },
    limitSwitch: { leftPressed, rightPressed },
    error: detail,
  };
}

export async function fetchPhysicalRailState(
  travelLimitsCm: TravelLimitsCm,
): Promise<RailMachineState> {
  let motorSt: PhysicalMotorSnapshot | null = null;
  let sensorSt: PhysicalSensorSnapshot | null = null;
  const errors: { motor?: string; sensor?: string } = {};

  try {
    motorSt = await motor.getMotorStatus();
  } catch (e) {
    errors.motor = friendlyMotorGrpcError(motor.motorConnectBaseUrl(), e);
  }

  try {
    sensorSt = await sensor.getSensorStatus();
  } catch (e) {
    errors.sensor = friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), e);
  }

  return buildPhysicalRailState(motorSt, sensorSt, travelLimitsCm, errors);
}
