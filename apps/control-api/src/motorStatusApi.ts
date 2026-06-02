import type * as motor from "@real-pendulum/physical-motor-service/sdk";

/** Travel limits on legacy motor status wire (cm field names). */
export type MotorTravelLimitsCm = {
  leftCm: number | null;
  rightCm: number | null;
};

/** Motor status exposed on control-api tRPC (rail position in cm, not Teknic counts). */
export type MotorStatusForClient = {
  connected: boolean;
  commandedCmPerSec: number;
  detail: string;
  motor?: motor.MotorInfo;
  positionCm?: number;
  travelLimits: MotorTravelLimitsCm;
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
