import { trpc } from "@/trpc";

export function useJogStopMutation() {
  return trpc.jog.stop.useMutation();
}
