import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

/** Faster polling while connected so Teknic measured position updates smoothly on screen. */
function motorStatusRefetchInterval(query: {
  state: { data?: { connected?: boolean } };
}): number {
  return query.state.data?.connected ? 300 : 1500;
}

function motorTwinRefetchInterval(query: {
  state: { data?: { real?: { connected?: boolean }; sim?: { connected?: boolean } } };
}): number {
  const d = query.state.data;
  if (!d) return 1500;
  return d.real?.connected || d.sim?.connected ? 300 : 1500;
}

/** Same poll as `useMotorStatusQuery`, but subscribes only to `connected`. Other fields (e.g. rpm) can change every tick without re-rendering observers — avoids cascading rerenders under MotorSessionProvider. */
export function useMotorStatusConnected() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.status.get.useQuery(undefined, {
    enabled: mode !== "twin",
    refetchInterval: motorStatusRefetchInterval,
    select: (row) => row?.connected ?? false,
  });
  const twin = trpc.twin.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: motorTwinRefetchInterval,
    select: (row) => (row?.real.connected ?? false) || (row?.sim.connected ?? false),
  });
  return mode === "twin" ? twin : single;
}

/** Matches **`SensorLedCard`** poll: faster while serial is open. */
function sensorStatusRefetchInterval(query: {
  state: { data?: { connected?: boolean } };
}): number {
  return query.state.data?.connected ? 80 : 1500;
}

function sensorTwinRefetchInterval(query: {
  state: { data?: { real?: { connected?: boolean }; sim?: { connected?: boolean } } };
}): number {
  const d = query.state.data;
  if (!d) return 1500;
  return d.real?.connected || d.sim?.connected ? 80 : 1500;
}

/** Subscribes only to Arduino / physical-sensor-service **connected** (hardware side when in twin mode). */
export function useSensorStatusConnected() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.sensor.status.get.useQuery(undefined, {
    enabled: mode !== "twin",
    refetchInterval: sensorStatusRefetchInterval,
    select: (row) => row?.connected ?? false,
  });
  const twin = trpc.twin.sensor.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: sensorTwinRefetchInterval,
    select: (row) => row?.real.connected ?? false,
  });
  return mode === "twin" ? twin : single;
}

/** Motor + sensor **real** / **sim** `connected` flags for the twin header badge. */
export function useTwinLinkageStatus() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const motor = trpc.twin.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: motorTwinRefetchInterval,
    select: (row) => ({
      hardware: row?.real?.connected ?? false,
      sim: row?.sim?.connected ?? false,
    }),
  });
  const sensor = trpc.twin.sensor.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: sensorTwinRefetchInterval,
    select: (row) => ({
      hardware: row?.real?.connected ?? false,
      sim: row?.sim?.connected ?? false,
    }),
  });
  const motorRow = motor.data;
  const sensorRow = sensor.data;
  return {
    motorHardware: motorRow?.hardware ?? false,
    sensorHardware: sensorRow?.hardware ?? false,
    motorSim: motorRow?.sim ?? false,
    sensorSim: sensorRow?.sim ?? false,
  };
}

/**
 * Motor status for UI. In **twin** mode, reads `twin.status.get` and merges **`real`** into the top-level
 * shape (so existing screens keep working), plus **`twinSimMotor`** for the simulated plant snapshot.
 */
export function useMotorStatusQuery() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.status.get.useQuery(undefined, {
    enabled: mode !== "twin",
    refetchInterval: motorStatusRefetchInterval,
  });
  const twin = trpc.twin.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: motorTwinRefetchInterval,
  });

  if (mode === "twin") {
    return {
      ...twin,
      data: twin.data
        ? {
            ...twin.data.real,
            twinSimMotor: twin.data.sim,
            twin: true as const,
          }
        : undefined,
    };
  }
  return single;
}

/** Full `{ real, sim }` sensor snapshot; only fetches when backend mode is **twin**. */
export function useTwinSensorStatusQuery() {
  const mode = useAtomValue(grpcBackendModeAtom);
  return trpc.twin.sensor.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: sensorTwinRefetchInterval,
  });
}

/** Sensor status: hardware-only shape in hardware/sim; in twin, maps **`real`** to the same fields as `sensor.status.get`. */
export function useSensorStatusQuery() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.sensor.status.get.useQuery(undefined, {
    enabled: mode !== "twin",
    refetchInterval: sensorStatusRefetchInterval,
  });
  const twin = trpc.twin.sensor.status.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: sensorTwinRefetchInterval,
  });

  if (mode === "twin") {
    return {
      ...twin,
      data: twin.data
        ? {
            ...twin.data.real,
            twinSimSensor: twin.data.sim,
            twin: true as const,
          }
        : undefined,
    };
  }
  return single;
}
