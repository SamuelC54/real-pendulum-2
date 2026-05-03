import { fromJsonString } from "@bufbuild/protobuf";
import { MotorInfoSchema, type MotorInfo } from "@real-pendulum/motor-proto/gen/motor_pb.js";

/**
 * Parses **`teknic_get_motor_info_json`** output: protobuf JSON (camelCase) matching **`motor.v1.MotorInfo`**.
 */
export function motorInfoFromTeknicJson(json: string): MotorInfo | null {
  try {
    return fromJsonString(MotorInfoSchema, json);
  } catch {
    return null;
  }
}
