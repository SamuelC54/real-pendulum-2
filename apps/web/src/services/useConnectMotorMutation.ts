import { trpc } from "@/trpc";

export function useConnectMotorMutation() {
  return trpc.machine.connect.useMutation();
}
