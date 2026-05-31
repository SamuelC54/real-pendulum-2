import { injectTraceHeaders } from "./index.js";

/** fetch with W3C trace context propagated to downstream HTTP services. */
export async function tracedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = injectTraceHeaders(init?.headers ?? {});
  return fetch(input, { ...init, headers });
}
