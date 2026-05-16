import type * as motor from "@real-pendulum/motor-service/sdk";
import {
  teknicMeasuredToCm,
  travelLimitsToCm,
  type TravelLimitsCm,
} from "./railPositionCm.js";

export type { TravelLimitsCm };

/** Motor status exposed on control-api tRPC (rail position in cm, not Teknic counts). */
export type MotorStatusForClient = {
  connected: boolean;
  commandedRpm: number;
  detail: string;
  motor?: motor.MotorInfo;
  positionCm?: number;
  travelLimits: TravelLimitsCm;
};

type RawMotorStatus = Awaited<ReturnType<typeof motor.getMotorStatus>> & {
  travelLimits: { left: number | null; right: number | null };
};

export function motorStatusForClient(st: RawMotorStatus): MotorStatusForClient {
  const { measuredPosition, travelLimits, ...rest } = st;
  return {
    ...rest,
    positionCm:
      measuredPosition !== undefined && Number.isFinite(measuredPosition)
        ? teknicMeasuredToCm(measuredPosition)
        : undefined,
    travelLimits: travelLimitsToCm(travelLimits),
  };
}
