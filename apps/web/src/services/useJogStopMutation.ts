import { trpc } from "@/trpc";

export function useJogStopMutation() {
  return trpc.machine.jog.stop.useMutation();
}
