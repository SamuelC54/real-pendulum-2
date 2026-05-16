import { readMotorStatusPayload, readSensorStatusPayload } from "./statusPayload.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";
import type { TuningComparePayload } from "./tuningSample.js";

export type { TuningComparePayload };

export async function fetchTuningCompare(): Promise<TuningComparePayload> {
  return {
    real: {
      motor: await withHardwareGrpc(() => readMotorStatusPayload()),
      sensor: await withHardwareGrpc(() => readSensorStatusPayload()),
    },
    sim: {
      motor: await withSimGrpc(() => readMotorStatusPayload()),
      sensor: await withSimGrpc(() => readSensorStatusPayload()),
    },
  };
}
