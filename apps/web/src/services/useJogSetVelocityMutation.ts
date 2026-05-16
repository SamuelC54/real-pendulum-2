import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function useJogSetVelocityMutation() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.jog.setVelocity.useMutation();
  const twin = trpc.twin.jog.setVelocity.useMutation();
  return mode === "twin" ? twin : single;
}
