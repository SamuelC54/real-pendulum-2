import { trpc } from "@/trpc";

/** Faster polling while connected so Teknic measured position updates smoothly on screen. */
function motorStatusRefetchInterval(query: {
  state: { data?: { connected?: boolean } };
}): number {
  return query.state.data?.connected ? 300 : 1500;
}

export function useMotorStatusQuery() {
  return trpc.status.get.useQuery(undefined, {
    refetchInterval: motorStatusRefetchInterval,
  });
}

/** Same poll as `useMotorStatusQuery`, but subscribes only to `connected`. Other fields (e.g. rpm) can change every tick without re-rendering observers — avoids cascading rerenders under MotorSessionProvider. */
export function useMotorStatusConnected() {
  return trpc.status.get.useQuery(undefined, {
    refetchInterval: motorStatusRefetchInterval,
    select: (row) => row?.connected ?? false,
  });
}

/** Matches **`SensorLedCard`** poll: faster while serial is open. */
function sensorStatusRefetchInterval(query: {
  state: { data?: { connected?: boolean } };
}): number {
  return query.state.data?.connected ? 80 : 1500;
}

/** Subscribes only to Arduino / sensor-service **connected**. */
export function useSensorStatusConnected() {
  return trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: sensorStatusRefetchInterval,
    select: (row) => row?.connected ?? false,
  });
}
