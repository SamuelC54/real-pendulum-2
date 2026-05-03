import { trpc } from "@/trpc";

export function useJogSetVelocityMutation() {
  return trpc.jog.setVelocity.useMutation();
}
