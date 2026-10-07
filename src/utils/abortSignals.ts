type AbortSignalWithAny = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };
type AbortSignalWithTimeout = typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal };

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

/** AbortSignal.timeout with a fallback for browsers that lack it (Safari/iOS < 16). Aborts with a TimeoutError. */
export function timeoutSignal(milliseconds: number): AbortSignal {
  const native = (AbortSignal as AbortSignalWithTimeout).timeout;
  if (typeof native === 'function') return native.call(AbortSignal, milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), milliseconds);
  return controller.signal;
}
