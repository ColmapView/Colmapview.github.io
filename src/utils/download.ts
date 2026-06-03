// Chromium queues a.click()-triggered downloads asynchronously. Staggering and
// deferring revocation prevents blob URLs from being freed before dispatch.
const DOWNLOAD_STAGGER_MS = 150;
const DOWNLOAD_REVOKE_DELAY_MS = 60_000;
let nextDownloadSlotAt = 0;

/** @internal test-only - reset the stagger clock so fake-timer tests start deterministically. */
export function __resetDownloadSchedulerForTests(): void {
  nextDownloadSlotAt = 0;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const now = Date.now();
  const fireAt = Math.max(now, nextDownloadSlotAt);
  nextDownloadSlotAt = fireAt + DOWNLOAD_STAGGER_MS;

  const trigger = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  };

  if (fireAt === now) trigger();
  else setTimeout(trigger, fireAt - now);
}

export function downloadFile(data: ArrayBuffer | string, filename: string): void {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: 'text/plain;charset=utf-8' })
      : new Blob([data], { type: 'application/octet-stream' });
  downloadBlob(blob, filename);
}

export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export function buildTimestampedFilename(prefix: string, ext: string, date = new Date()): string {
  const timestamp = date.toISOString().slice(0, 19).replace(/[:-]/g, '');
  return `${prefix}-${timestamp}.${ext}`;
}
