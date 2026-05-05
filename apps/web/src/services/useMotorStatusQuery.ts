import { trpc } from "@/trpc";

const pollOpts = { refetchInterval: 1000 } as const;

export function useMotorStatusQuery() {
  return trpc.status.get.useQuery(undefined, pollOpts);
}

/** Same poll as `useMotorStatusQuery`, but subscribes only to `connected`. Other fields (e.g. rpm) can change every tick without re-rendering observers — avoids cascading rerenders under MotorSessionProvider. */
export function useMotorStatusConnected() {
  return trpc.status.get.useQuery(undefined, {
    ...pollOpts,
    select: (row) => row?.connected ?? false,
  });
}
