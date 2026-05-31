import type { MotorStatusForClient } from "../../motorStatusApi.js";
import type { SensorStatusPayload } from "../../statusPayload.js";
import { cmPerSecToRpm, rpmToCmPerSec } from "../motionUnits.js";
import type { RailMachineState } from "../types.js";

export function motorStatusFromRailState(state: RailMachineState): MotorStatusForClient {
  return {
    connected: state.connection.cart,
    commandedRpm: cmPerSecToRpm(state.cart.commandedCmPerSec),
    detail: state.error ?? (state.connection.cart ? "ok" : "disconnected"),
    positionCm: state.cart.positionCm ?? undefined,
    travelLimits: {
      leftCm: state.cart.travelLimitsCm.left,
      rightCm: state.cart.travelLimitsCm.right,
    },
  };
}

export function sensorStatusFromRailState(state: RailMachineState): SensorStatusPayload {
  return {
    connected: state.connection.sensor,
    ledOn: state.led.on,
    detail: state.connection.sensor ? "ok" : "disconnected",
    serialPort: "",
    encoderTicks: state.pendulum.encoderTicks,
    limitLeftPressed: state.limitSwitch.leftPressed,
    limitRightPressed: state.limitSwitch.rightPressed,
  };
}

export function railStateCommandedCmPerSecFromMotor(st: {
  connected: boolean;
  commandedRpm: number;
}): number {
  if (!st.connected) return 0;
  return rpmToCmPerSec(st.commandedRpm);
}
