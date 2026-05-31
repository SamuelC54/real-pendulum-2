import { trpc } from "@/trpc";

export function useDisconnectMotorMutation() {
  return trpc.machine.disconnect.useMutation();
}
