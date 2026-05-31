import { usePhysicalBackendAutoConnect } from "@/services/usePhysicalBackendAutoConnect";
import { useSimulationBackendAutoConnect } from "@/services/useSimulationBackendAutoConnect";

/** Mount once under tRPC — auto-connect for simulation (retry) and physical bench (once). */
export function BackendAutoConnect() {
  useSimulationBackendAutoConnect();
  usePhysicalBackendAutoConnect();
  return null;
}
