import {
  config,
  e2eFakeControlApiTrpcUrl,
  e2eRealControlApiTrpcUrl,
  webControlApiBaseUrl,
} from "@real-pendulum/app-config";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@real-pendulum/control-api/router";
import { grpcBackendModeAtom } from "./stores/grpcBackendMode";
import { jotaiStore } from "./stores/jotaiStore";

export const trpc = createTRPCReact<AppRouter>();

function trpcUrl() {
  if (__PENDULUM_VITE_MODE__ === "e2e") return e2eFakeControlApiTrpcUrl();
  if (__PENDULUM_VITE_MODE__ === "e2e-real") return e2eRealControlApiTrpcUrl();
  if (config.web.controlApiUrl?.trim()) return config.web.controlApiUrl.trim();
  if (typeof window !== "undefined") {
    return `${window.location.origin}/trpc`;
  }
  return `${webControlApiBaseUrl()}/trpc`;
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
