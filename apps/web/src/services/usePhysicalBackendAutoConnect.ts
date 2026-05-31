import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { resolveSensorPortForAutoConnect } from "@/lib/sensorPortAutoConnect";
import { controlBackendModeAtom } from "@/stores/controlBackendMode";
import { sensorSerialPortAtom } from "@/stores/sensorSerialPort";
import { trpc } from "@/trpc";
import { useConnectMotorMutation } from "./useConnectMotorMutation";
import { useConnectSensorMutation } from "./useConnectSensorMutation";
import { useMotorStatusConnected, useSensorStatusConnected } from "./useMotorStatusQuery";

/**
 * In **physical** backend mode, try once per visit to connect motor + sensor (saved USB port when set).
 */
export function usePhysicalBackendAutoConnect(): void {
  const mode = useAtomValue(controlBackendModeAtom);
  const savedPort = useAtomValue(sensorSerialPortAtom);
  const active = mode === "physical";
  const utils = trpc.useUtils();
  const motorConnected = useMotorStatusConnected();
  const sensorConnected = useSensorStatusConnected();
  const connectMotor = useConnectMotorMutation();
  const connectSensor = useConnectSensorMutation();
  const attemptedRef = useRef(false);

  const portsQuery = trpc.sensor.serial.list.useQuery(undefined, {
    enabled: active,
    retry: 1,
  });

  const ports = portsQuery.data ?? [];
  const sensorPort = resolveSensorPortForAutoConnect(ports, savedPort);
  const needsPortList = !savedPort.trim() && ports.length !== 1;
  const portsReady = !needsPortList || !portsQuery.isPending;

  useEffect(() => {
    if (!active) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current || !portsReady) return;

    const motorOk = motorConnected.data ?? false;
    const sensorOk = sensorConnected.data ?? false;
    if (motorOk && (sensorOk || !sensorPort)) {
      attemptedRef.current = true;
      return;
    }

    attemptedRef.current = true;

    const invalidate = () => {
      void utils.machine.state.get.invalidate();
    };

    void (async () => {
      try {
        if (!motorOk) {
          await connectMotor.mutateAsync();
        }
        if (!sensorOk && sensorPort) {
          await connectSensor.mutateAsync({ serialPort: sensorPort });
        }
        invalidate();
      } catch {
        invalidate();
      }
    })();
    // One shot per hardware-mode visit; omit mutation handles from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [active, portsReady, motorConnected.data, sensorConnected.data, sensorPort]);
}
