import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";
import { useConnectMotorMutation } from "./useConnectMotorMutation";
import { useConnectSensorMutation } from "./useConnectSensorMutation";
import { useMotorStatusConnected, useSensorStatusConnected } from "./useMotorStatusQuery";

const RETRY_MS = 2500;

/**
 * In **sim** backend mode, connect motor + sensor gRPC to the simulation plant without USB boards.
 * Retries until both report connected (e.g. while physics-sim is still starting).
 */
export function useSimBackendAutoConnect(): {
  active: boolean;
  pending: boolean;
  ready: boolean;
  lastError: string | null;
} {
  const mode = useAtomValue(grpcBackendModeAtom);
  const active = mode === "sim";
  const utils = trpc.useUtils();
  const motorConnected = useMotorStatusConnected();
  const sensorConnected = useSensorStatusConnected();
  const connectMotor = useConnectMotorMutation();
  const connectSensor = useConnectSensorMutation();
  const [lastError, setLastError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const ready = (motorConnected.data ?? false) && (sensorConnected.data ?? false);
  const pending =
    active &&
    !ready &&
    (connectMotor.isPending ||
      connectSensor.isPending ||
      motorConnected.isFetching ||
      sensorConnected.isFetching);

  useEffect(() => {
    if (!active) {
      setLastError(null);
      return;
    }

    let cancelled = false;

    const invalidate = () => {
      void utils.status.get.invalidate();
      void utils.sensor.status.get.invalidate();
    };

    const tick = async () => {
      if (cancelled || runningRef.current) return;
      const motorOk = motorConnected.data ?? false;
      const sensorOk = sensorConnected.data ?? false;
      if (motorOk && sensorOk) {
        setLastError(null);
        return;
      }

      runningRef.current = true;
      try {
        if (!motorOk) {
          const r = await connectMotor.mutateAsync();
          if (!r.ok && r.error) {
            setLastError(r.error);
          }
        }
        if (!sensorOk) {
          const r = await connectSensor.mutateAsync({});
          if ("ok" in r && !r.ok && r.error) {
            setLastError(r.error);
          }
        }
        invalidate();
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), RETRY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // connectMotor / connectSensor are stable enough for retry; omit to avoid effect churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retry on connection flags only
  }, [active, motorConnected.data, sensorConnected.data]);

  return { active, pending, ready, lastError };
}
