export const FILE_URL_REVOKE_IDLE_TIMEOUT_MS = 1000;
export const FILE_URL_REVOKE_FALLBACK_DELAY_MS = 100;

interface IdleCallbackScheduler {
  (callback: () => void, options: { timeout: number }): unknown;
}

interface TimeoutScheduler {
  (callback: () => void, delay: number): unknown;
}

interface ScheduleBlobUrlRevocationOptions {
  blobUrl: string;
  pendingRevocations: Set<string>;
  requestIdleCallback?: IdleCallbackScheduler;
  setTimeout?: TimeoutScheduler;
  revokeObjectUrl?: (blobUrl: string) => void;
  idleTimeoutMs?: number;
  fallbackDelayMs?: number;
}

export type BlobUrlRevocationScheduler = 'idle-callback' | 'timeout';

export function revokePendingBlobUrl(
  blobUrl: string,
  pendingRevocations: Set<string>,
  revokeObjectUrl = URL.revokeObjectURL.bind(URL)
): boolean {
  if (!pendingRevocations.has(blobUrl)) return false;

  pendingRevocations.delete(blobUrl);
  revokeObjectUrl(blobUrl);
  return true;
}

export function scheduleBlobUrlRevocation({
  blobUrl,
  pendingRevocations,
  requestIdleCallback,
  setTimeout: scheduleTimeout = setTimeout,
  revokeObjectUrl,
  idleTimeoutMs = FILE_URL_REVOKE_IDLE_TIMEOUT_MS,
  fallbackDelayMs = FILE_URL_REVOKE_FALLBACK_DELAY_MS,
}: ScheduleBlobUrlRevocationOptions): BlobUrlRevocationScheduler {
  pendingRevocations.add(blobUrl);

  const revoke = () => {
    revokePendingBlobUrl(blobUrl, pendingRevocations, revokeObjectUrl);
  };

  if (requestIdleCallback) {
    requestIdleCallback(revoke, { timeout: idleTimeoutMs });
    return 'idle-callback';
  }

  scheduleTimeout(revoke, fallbackDelayMs);
  return 'timeout';
}

export function revokeAllPendingBlobUrls(
  pendingRevocations: Set<string>,
  revokeObjectUrl = URL.revokeObjectURL.bind(URL)
): number {
  let revokedCount = 0;

  for (const blobUrl of pendingRevocations) {
    revokeObjectUrl(blobUrl);
    revokedCount++;
  }

  pendingRevocations.clear();
  return revokedCount;
}
