import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function useConnectMotorMutation() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.connection.connect.useMutation();
  const twin = trpc.twin.connection.connect.useMutation();
  return mode === "twin" ? twin : single;
}
