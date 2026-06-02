import type * as motor from "@real-pendulum/physical-motor-service/sdk";
import type { TravelLimitsCm } from "./railPositionCm.js";

export type { TravelLimitsCm };

/** Motor status exposed on control-api tRPC (rail position in cm, not Teknic counts). */
export type MotorStatusForClient = {
  connected: boolean;
  commandedCmPerSec: number;
  detail: string;
  motor?: motor.MotorInfo;
  positionCm?: number;
  travelLimits: TravelLimitsCm;
};

/** Sensor board snapshot derived from {@link RailMachineState} (control/backends/physical/railStateMappers). */
export type SensorStatusPayload = {
  connected: boolean;
  ledOn: boolean;
  detail: string;
  serialPort: string;
  encoderTicks: number;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};
