import { useAtomValue } from "jotai";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function useConnectSensorMutation() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const single = trpc.sensor.connection.connect.useMutation();
  const twin = trpc.twin.sensor.connection.connect.useMutation();
  return mode === "twin" ? twin : single;
}
