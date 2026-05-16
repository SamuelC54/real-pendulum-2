import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@real-pendulum/control-api/router";
import { grpcBackendModeAtom } from "./stores/grpcBackendMode";
import { jotaiStore } from "./stores/jotaiStore";

export const trpc = createTRPCReact<AppRouter>();

function trpcUrl() {
  const fromEnv = import.meta.env.VITE_CONTROL_API_URL;
  if (fromEnv) return fromEnv;
  return `${window.location.origin}/trpc`;
}

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: trpcUrl(),
        transformer: superjson,
        headers() {
          const mode = jotaiStore.get(grpcBackendModeAtom);
          return { "x-pendulum-backend": mode };
        },
      }),
    ],
  });
}
