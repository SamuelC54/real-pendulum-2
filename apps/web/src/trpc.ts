import {
  config,
  e2eControlApiTrpcUrl,
  e2eRealControlApiTrpcUrl,
  webControlApiBaseUrl,
} from "@real-pendulum/app-config";
import { httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@real-pendulum/control-api/router";
import { controlBackendModeAtom } from "./stores/controlBackendMode";
import { jotaiStore } from "./stores/jotaiStore";
import { lastTraceIdAtom } from "./stores/lastTraceId";

export const trpc = createTRPCReact<AppRouter>();

function trpcUrl() {
  if (__PENDULUM_VITE_MODE__ === "e2e") return e2eControlApiTrpcUrl();
  if (__PENDULUM_VITE_MODE__ === "e2e-real") return e2eRealControlApiTrpcUrl();
  if (config.web.controlApiUrl?.trim()) return config.web.controlApiUrl.trim();
  if (typeof window !== "undefined") {
    return `${window.location.origin}/trpc`;
  }
  return `${webControlApiBaseUrl()}/trpc`;
}

function tracedFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  return fetch(url, options).then((res) => {
    const traceId = res.headers.get("x-trace-id");
    if (traceId) {
      jotaiStore.set(lastTraceIdAtom, traceId);
    }
    return res;
  });
}

export function createTrpcClient() {
  const url = trpcUrl();
  const linkOptions = {
    url,
    transformer: superjson,
    fetch: tracedFetch,
  } as const;

  return trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          ...linkOptions,
          connectionParams: () => ({
            backend: jotaiStore.get(controlBackendModeAtom),
          }),
        }),
        false: httpBatchLink({
          ...linkOptions,
          headers() {
            const mode = jotaiStore.get(controlBackendModeAtom);
            return { "x-control-backend": mode };
          },
        }),
      }),
    ],
  });
}
