import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, __resetDownloadSchedulerForTests } from './writers';

/**
 * Covers the Chromium-race fix in downloadFile / downloadBlob:
 *  - sequential calls are staggered 150ms apart
 *  - URL.revokeObjectURL is deferred (not called synchronously)
 */
describe('downloadFile stagger + deferred revoke', () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let urlCounter = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetDownloadSchedulerForTests();
    urlCounter = 0;
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${urlCounter++}`);
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
    vi.useRealTimers();
  });

  it('revoke is deferred by at least a few seconds', () => {
    downloadFile(new ArrayBuffer(8), 'solo.bin');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('three rapid calls trigger clicks in order, staggered ~150ms apart', () => {
    downloadFile(new ArrayBuffer(8), 'a.bin');
    downloadFile(new ArrayBuffer(8), 'b.bin');
    downloadFile(new ArrayBuffer(8), 'c.bin');

    // First fires synchronously; later ones wait for their slot.
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(150);
    expect(clickSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(150);
    expect(clickSpy).toHaveBeenCalledTimes(3);
  });

  it('each blob URL is revoked exactly once after all staggered clicks fire', () => {
    downloadFile('first', 'first.txt');
    downloadFile('second', 'second.txt');
    downloadFile('third', 'third.txt');

    // Advance past all stagger slots
    vi.advanceTimersByTime(450);
    expect(clickSpy).toHaveBeenCalledTimes(3);

    // Still no revokes — the 60s timer hasn't fired yet
    expect(revokeSpy).not.toHaveBeenCalled();

    // Advance past the longest revoke timer
    vi.advanceTimersByTime(60_000);
    expect(revokeSpy).toHaveBeenCalledTimes(3);
  });
});
