type AbortSignalWithAny = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };

/**
 * AbortSignal.any with a fallback for browsers that lack it (Safari/iOS < 17.4,
 * Chrome < 116, Firefox < 124). Aborts with the reason of the first input to abort.
 */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const native = (AbortSignal as AbortSignalWithAny).any;
  if (typeof native === 'function') return native.call(AbortSignal, [...signals]);
  const controller = new AbortController();
  const aborted = signals.find(signal => signal.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }
  const onAbort = (event: Event) => {
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const signal of signals) signal.addEventListener('abort', onAbort);
  return controller.signal;
}
