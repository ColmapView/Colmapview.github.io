const URL_LOAD_ATTEMPT_STORAGE_KEY = 'colmapview.urlLoadAttempt.v1';

export interface UrlLoadAttemptRecord {
  url: string;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Crash-loop breaker for URL auto-loads. The record is written before an
 * auto-load starts and cleared when the load settles (success OR handled
 * failure). Only a hard tab crash - e.g. mobile OOM followed by the browser's
 * automatic reload - leaves it behind, so its presence at startup means "the
 * last attempt to load this URL killed the tab": ask before trying again.
 */
export function readUnfinishedUrlLoadAttempt(
  storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): UrlLoadAttemptRecord | null {
  try {
    const raw = storage?.getItem(URL_LOAD_ATTEMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { url?: unknown }).url === 'string') {
      return { url: (parsed as { url: string }).url };
    }
    return null;
  } catch {
    return null;
  }
}

export function markUrlLoadAttemptStarted(
  url: string,
  storage: Pick<Storage, 'setItem'> | null = defaultStorage()
): void {
  try {
    storage?.setItem(URL_LOAD_ATTEMPT_STORAGE_KEY, JSON.stringify({ url }));
  } catch {
    // Storage unavailable: lose the breaker, never the load.
  }
}

export function clearUrlLoadAttempt(
  storage: Pick<Storage, 'removeItem'> | null = defaultStorage()
): void {
  try {
    storage?.removeItem(URL_LOAD_ATTEMPT_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

export function shouldConfirmUrlAutoLoad(
  previous: UrlLoadAttemptRecord | null,
  manifestUrl: string
): boolean {
  return previous !== null && previous.url === manifestUrl;
}
