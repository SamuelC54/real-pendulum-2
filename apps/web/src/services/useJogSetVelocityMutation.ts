import { trpc } from "@/trpc";

export function useJogSetVelocityMutation() {
  return trpc.machine.jog.set.useMutation();
}
