import { useHardwareBackendAutoConnect } from "@/services/useHardwareBackendAutoConnect";
import { useSimBackendAutoConnect } from "@/services/useSimBackendAutoConnect";

/** Mount once under tRPC — auto-connect for Simulator (retry) and Hardware (once). */
export function BackendAutoConnect() {
  useSimBackendAutoConnect();
  useHardwareBackendAutoConnect();
  return null;
}
