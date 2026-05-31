export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sleep that resolves early when the subscription abort signal fires. */
export async function sleepUntilAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function* pollWhileSubscribed<T>(
  poll: () => Promise<T> | T,
  signal: AbortSignal | undefined,
  intervalMs: (last: T | undefined) => number,
): AsyncGenerator<T> {
  const abort = signal ?? new AbortController().signal;
  let last: T | undefined;
  while (!abort.aborted) {
    last = await poll();
    yield last;
    await sleepUntilAbort(intervalMs(last), abort);
  }
}
