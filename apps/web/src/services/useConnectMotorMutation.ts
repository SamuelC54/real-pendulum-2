import { trpc } from "@/trpc";

export function useConnectMotorMutation() {
  return trpc.connection.connect.useMutation();
}
