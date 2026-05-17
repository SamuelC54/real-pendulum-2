import { useAtomValue } from "jotai";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { grpcBackendModeAtom, type GrpcBackendMode } from "@/stores/grpcBackendMode";

export type SimPlantTelemetry = {
  mode: GrpcBackendMode;
  positionCm: number | undefined;
  encoderTicks: number;
  connected: boolean;
  /** True when sim or twin mode exposes a coupled plant snapshot. */
  supportsTwinView: boolean;
};

/** Motor + encoder for the **simulator** leg (sim mode or twin `sim` snapshot). */
export function useSimPlantTelemetry(): SimPlantTelemetry {
  const mode = useAtomValue(grpcBackendModeAtom);
  const motor = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  if (mode === "twin") {
    const twinSimMotor =
      motor.data && "twinSimMotor" in motor.data ? motor.data.twinSimMotor : undefined;
    const twinSimSensor =
      sensor.data && "twinSimSensor" in sensor.data ? sensor.data.twinSimSensor : undefined;
    return {
      mode,
      positionCm: twinSimMotor?.positionCm,
      encoderTicks: twinSimSensor?.encoderTicks ?? 0,
      connected: Boolean(twinSimMotor?.connected && twinSimSensor?.connected),
      supportsTwinView: true,
    };
  }

  if (mode === "sim") {
    return {
      mode,
      positionCm: motor.data?.positionCm,
      encoderTicks: sensor.data?.encoderTicks ?? 0,
      connected: Boolean(motor.data?.connected && sensor.data?.connected),
      supportsTwinView: true,
    };
  }

  return {
    mode,
    positionCm: undefined,
    encoderTicks: 0,
    connected: false,
    supportsTwinView: false,
  };
}
