import { trpc } from "@/trpc";

export function useConnectSensorMutation() {
  return trpc.sensor.connection.connect.useMutation();
}
