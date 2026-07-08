import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerConfirmationHandler } from './utils/confirmation';
import {
  clearUrlLoadAttempt,
  markUrlLoadAttemptStarted,
  readUnfinishedUrlLoadAttempt,
} from './utils/urlLoadAttemptGuard';
import { runGuardedUrlLoad } from './appUrlLoadGuard';

const MANIFEST_URL = 'https://example.com/manifest.json';

beforeEach(() => {
  clearUrlLoadAttempt();
  registerConfirmationHandler(null);
});

afterEach(() => {
  clearUrlLoadAttempt();
  registerConfirmationHandler(null);
});

describe('runGuardedUrlLoad', () => {
  it('loads without confirmation and clears the attempt on settle when there is no unfinished attempt', async () => {
    const loadFromUrl = vi.fn(async () => true);
    const onDeclined = vi.fn();

    const loaded = await runGuardedUrlLoad({ manifestUrl: MANIFEST_URL, loadFromUrl, onDeclined });

    expect(loaded).toBe(true);
    expect(loadFromUrl).toHaveBeenCalledWith(MANIFEST_URL);
    expect(onDeclined).not.toHaveBeenCalled();
    expect(readUnfinishedUrlLoadAttempt()).toBeNull();
  });

  it('re-arms the attempt before the load and clears it on settle when the user confirms a crash-loop reload', async () => {
    markUrlLoadAttemptStarted(MANIFEST_URL); // a previous attempt did not finish (matches the URL)
    let recordDuringLoad: unknown = 'unset';
    const loadFromUrl = vi.fn(async () => {
      recordDuringLoad = readUnfinishedUrlLoadAttempt();
      return true;
    });
    const confirmHandler = vi.fn(async () => true);
    registerConfirmationHandler(confirmHandler);
    const onDeclined = vi.fn();

    const loaded = await runGuardedUrlLoad({ manifestUrl: MANIFEST_URL, loadFromUrl, onDeclined });

    expect(confirmHandler).toHaveBeenCalledTimes(1);
    expect(loaded).toBe(true);
    expect(loadFromUrl).toHaveBeenCalledWith(MANIFEST_URL);
    expect(recordDuringLoad).toEqual({ url: MANIFEST_URL }); // record re-armed before the load
    expect(onDeclined).not.toHaveBeenCalled();
    expect(readUnfinishedUrlLoadAttempt()).toBeNull(); // cleared on settle
  });

  it('clears the attempt, invokes onDeclined, and never loads when the user declines', async () => {
    markUrlLoadAttemptStarted(MANIFEST_URL);
    const loadFromUrl = vi.fn(async () => true);
    const onDeclined = vi.fn();
    registerConfirmationHandler(async () => false);

    const loaded = await runGuardedUrlLoad({ manifestUrl: MANIFEST_URL, loadFromUrl, onDeclined });

    expect(loaded).toBe(false);
    expect(loadFromUrl).not.toHaveBeenCalled();
    expect(onDeclined).toHaveBeenCalledTimes(1);
    expect(readUnfinishedUrlLoadAttempt()).toBeNull();
  });
});
