/** Stop waiting on work that may not support cancellation itself. */
export function awaitWithAbort<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
  discard?: (value: T) => void,
): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    pending.then(value => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) discard?.(value);
      else resolve(value);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}
