import { requestConfirmation } from './utils/confirmation';
import {
  clearUrlLoadAttempt,
  markUrlLoadAttemptStarted,
  readUnfinishedUrlLoadAttempt,
  shouldConfirmUrlAutoLoad,
} from './utils/urlLoadAttemptGuard';

export interface GuardedUrlLoadOptions {
  manifestUrl: string;
  /** Performs the actual load; returns whether it succeeded. */
  loadFromUrl: (url: string) => Promise<boolean>;
  /**
   * Called when the user declines a crash-loop reload. The caller must reset the
   * URL-loading UI here (see abandonUrlAutoLoadRequest) so the landing page is
   * reachable again — otherwise the app stays stuck on a permanent "Loading…".
   */
  onDeclined: () => void;
}

/**
 * Crash-loop-guarded URL auto-load. If the previous attempt to load THIS url did
 * not settle (a hard tab crash left the sessionStorage breaker behind), ask before
 * retrying. On decline we clear the breaker, hand control back via onDeclined, and
 * never start the load. On confirm (or when there is no unfinished attempt) we
 * re-arm the breaker before the load and clear it once the load settles.
 */
export async function runGuardedUrlLoad({
  manifestUrl,
  loadFromUrl,
  onDeclined,
}: GuardedUrlLoadOptions): Promise<boolean> {
  const previousAttempt = readUnfinishedUrlLoadAttempt();
  if (shouldConfirmUrlAutoLoad(previousAttempt, manifestUrl)) {
    const retry = await requestConfirmation({
      title: 'Reload this dataset?',
      message: 'The previous attempt to load this dataset did not finish - it may have run out of memory on this device. Load it again?',
      confirmLabel: 'Load again',
      cancelLabel: 'Not now',
      size: 'compact',
    });
    if (!retry) {
      clearUrlLoadAttempt();
      onDeclined();
      return false;
    }
  }
  markUrlLoadAttemptStarted(manifestUrl);
  const loaded = await loadFromUrl(manifestUrl);
  clearUrlLoadAttempt();
  return loaded;
}
