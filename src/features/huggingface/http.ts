export class HfError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.name = 'HfError'; this.status = status; }
}

export function errorStatus(error: unknown): number | undefined {
  if (error instanceof HfError) return error.status;
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** `timeout: null` leaves the deadline to the caller's signal, e.g. an idle transfer timeout. */
export function boundedFetch(signal: AbortSignal, timeout: number | null = 60_000, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const bounded = timeout === null ? signal : AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    const canRetry = ['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase());
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(input, { ...init, credentials: 'omit', signal: bounded });
      if (!canRetry || attempt >= 2 || ![429, 502, 503, 504].includes(response.status)) return response;
      const header = response.headers.get('retry-after');
      const seconds = header === null ? NaN : Number(header);
      const retryAfter = header === null ? NaN : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
      const backoff = 500 * 2 ** attempt + Math.random() * 200;
      await response.body?.cancel();
      await delay(Math.max(0, Number.isFinite(retryAfter) ? retryAfter : backoff), bounded);
    }
  };
}

export function publicationErrorMessage(error: unknown): string {
  switch (errorStatus(error)) {
    case 401: return 'Your Hugging Face connection expired. Reconnect the same account, then retry.';
    case 403: return 'Hugging Face denied this operation. Check the connected account and repository permission.';
    case 409: return 'The repository already exists or changed during publication. Choose a new name for a new publication.';
    case 429: return 'Hugging Face is limiting requests. Wait briefly, then retry.';
  }
  // Provider errors can contain request URLs or credentials. Display only our own messages.
  return error instanceof HfError ? error.message : 'Publication could not finish. Check your connection and retry in this tab.';
}
