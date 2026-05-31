import { useAtomValue } from "jotai";
import { useMotorStatusQuery, useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { controlBackendModeAtom, type ControlBackendMode } from "@/stores/controlBackendMode";

export type SimPlantTelemetry = {
  mode: ControlBackendMode;
  positionCm: number | undefined;
  encoderTicks: number;
  connected: boolean;
  /** True when sim or twin mode exposes a simulation plant snapshot. */
  supportsTwinView: boolean;
};

/** Motor + encoder for the **simulator** leg (sim mode or twin `sim` snapshot). */
export function useSimPlantTelemetry(): SimPlantTelemetry {
  const mode = useAtomValue(controlBackendModeAtom);
  const motor = useMotorStatusQuery();
  const sensor = useSensorStatusQuery();

  if (mode === "twin") {
    const twinSim = motor.data && "twinSim" in motor.data ? motor.data.twinSim : undefined;
    return {
      mode,
      positionCm: twinSim?.cart.positionCm ?? undefined,
      encoderTicks: twinSim?.pendulum.encoderTicks ?? 0,
      connected: Boolean(twinSim?.connection.cart && twinSim?.connection.sensor),
      supportsTwinView: true,
    };
  }

  if (mode === "simulation") {
    return {
      mode,
      positionCm: motor.data?.cart.positionCm ?? undefined,
      encoderTicks: sensor.data?.pendulum.encoderTicks ?? 0,
      connected: Boolean(motor.data?.connection.cart && sensor.data?.connection.sensor),
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
