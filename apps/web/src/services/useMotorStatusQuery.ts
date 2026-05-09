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
