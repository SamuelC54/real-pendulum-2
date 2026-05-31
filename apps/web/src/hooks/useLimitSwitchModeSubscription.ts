import { trpc } from "@/trpc";

/** Live limit-switch mode state via SSE. */
export function useLimitSwitchModeSubscription() {
  return trpc.limitSwitchMode.subscribe.useSubscription(undefined);
}
