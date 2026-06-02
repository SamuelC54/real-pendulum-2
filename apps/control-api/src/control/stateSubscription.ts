import type { MachineStateSources, Unsubscribe } from "./types.js";

/** Bridges backend `subscribeToState` callbacks to tRPC subscription async iterators. */
export async function* subscribeToStateStream(
  subscribe: (callback: (state: MachineStateSources) => void) => Unsubscribe,
  signal?: AbortSignal,
): AsyncGenerator<MachineStateSources> {
  const queue: MachineStateSources[] = [];
  let wake: (() => void) | undefined;

  const unsub = subscribe((state) => {
    queue.push(state);
    wake?.();
    wake = undefined;
  });

  try {
    while (!signal?.aborted) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          wake = resolve;
          signal?.addEventListener("abort", resolve, { once: true });
        });
      }
      while (queue.length > 0 && !signal?.aborted) {
        yield queue.shift()!;
      }
    }
  } finally {
    unsub();
  }
}
