import { trpc } from "@/trpc";

export function useDisconnectMotorMutation() {
  return trpc.connection.disconnect.useMutation();
}
