import { useSimBackendAutoConnect } from "@/services/useSimBackendAutoConnect";

/** Mount once under tRPC — connects coupled sim motor + sensor when backend mode is Simulator. */
export function SimBackendAutoConnect() {
  useSimBackendAutoConnect();
  return null;
}
