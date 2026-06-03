import { describe, expect, it, vi } from 'vitest';
import {
  FILE_URL_REVOKE_FALLBACK_DELAY_MS,
  FILE_URL_REVOKE_IDLE_TIMEOUT_MS,
  revokeAllPendingBlobUrls,
  revokePendingBlobUrl,
  scheduleBlobUrlRevocation,
} from './fileUrlRevocationPolicy';

describe('file URL revocation policy', () => {
  it('schedules revocation with requestIdleCallback when available', () => {
    const pending = new Set<string>();
    const requestIdleCallback = vi.fn();

    const scheduler = scheduleBlobUrlRevocation({
      blobUrl: 'blob:image-1',
      pendingRevocations: pending,
      requestIdleCallback,
      setTimeout: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });

    expect(scheduler).toBe('idle-callback');
    expect(pending.has('blob:image-1')).toBe(true);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: FILE_URL_REVOKE_IDLE_TIMEOUT_MS,
    });
  });

  it('falls back to timeout scheduling when idle callback is unavailable', () => {
    const pending = new Set<string>();
    const scheduleTimeout = vi.fn();

    const scheduler = scheduleBlobUrlRevocation({
      blobUrl: 'blob:image-2',
      pendingRevocations: pending,
      setTimeout: scheduleTimeout,
      revokeObjectUrl: vi.fn(),
    });

    expect(scheduler).toBe('timeout');
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), FILE_URL_REVOKE_FALLBACK_DELAY_MS);
  });

  it('revokes and removes a pending blob URL exactly once', () => {
    const pending = new Set(['blob:image-3']);
    const revokeObjectUrl = vi.fn();

    expect(revokePendingBlobUrl('blob:image-3', pending, revokeObjectUrl)).toBe(true);
    expect(revokePendingBlobUrl('blob:image-3', pending, revokeObjectUrl)).toBe(false);
    expect(pending.has('blob:image-3')).toBe(false);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:image-3');
  });

  it('connects scheduled callbacks to pending URL revocation', () => {
    const pending = new Set<string>();
    const revokeObjectUrl = vi.fn();
    let scheduledCallback: (() => void) | null = null;

    scheduleBlobUrlRevocation({
      blobUrl: 'blob:image-4',
      pendingRevocations: pending,
      requestIdleCallback: (callback) => {
        scheduledCallback = callback;
      },
      revokeObjectUrl,
    });

    expect(pending.has('blob:image-4')).toBe(true);

    scheduledCallback?.();

    expect(pending.has('blob:image-4')).toBe(false);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:image-4');
  });

  it('revokes all pending blob URLs during unmount cleanup', () => {
    const pending = new Set(['blob:image-5', 'blob:image-6']);
    const revokeObjectUrl = vi.fn();

    expect(revokeAllPendingBlobUrls(pending, revokeObjectUrl)).toBe(2);
    expect(pending.size).toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:image-5');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:image-6');
  });
});
