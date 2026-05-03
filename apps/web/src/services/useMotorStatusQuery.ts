import { trpc } from "@/trpc";

export function useMotorStatusQuery() {
  return trpc.status.get.useQuery(undefined, { refetchInterval: 1000 });
}
