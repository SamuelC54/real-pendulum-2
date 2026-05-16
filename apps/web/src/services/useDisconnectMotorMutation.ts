import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function useDisconnectMotorMutation() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.connection.disconnect.useMutation();
  const twin = trpc.twin.connection.disconnect.useMutation();
  return mode === "twin" ? twin : single;
}
