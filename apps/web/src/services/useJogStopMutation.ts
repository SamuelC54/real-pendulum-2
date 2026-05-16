import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function useJogStopMutation() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.jog.stop.useMutation();
  const twin = trpc.twin.jog.stop.useMutation();
  return mode === "twin" ? twin : single;
}
