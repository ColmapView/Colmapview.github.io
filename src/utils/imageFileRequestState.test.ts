import { describe, expect, it } from 'vitest';
import { createImageFileRequestState } from './imageFileRequestState';

describe('image file request state', () => {
  it('stores cached files and reports cache statistics', () => {
    const state = createImageFileRequestState();
    const first = new File([new Uint8Array([1, 2, 3])], 'first.jpg');
    const second = new File([new Uint8Array([4])], 'second.jpg');

    expect(state.hasCached('first')).toBe(false);
    expect(state.getCached('first')).toBeUndefined();

    state.setCached('first', first);
    state.setCached('second', second);

    expect(state.hasCached('first')).toBe(true);
    expect(state.getCached('first')).toBe(first);
    expect(state.getStats()).toEqual({ count: 2, sizeBytes: 4 });

    state.deleteCached('first');
    expect(state.getCached('first')).toBeUndefined();
    expect(state.getStats()).toEqual({ count: 1, sizeBytes: 1 });
  });

  it('tracks pending requests and resolves all waiters on completion', async () => {
    const state = createImageFileRequestState();
    const file = new File(['image'], 'image.jpg');

    state.startRequest('request-key');
    expect(state.isRequestPending('request-key')).toBe(true);

    const firstWaiter = state.waitForRequest('request-key');
    const secondWaiter = state.waitForRequest('request-key');

    state.completeRequest('request-key', file);

    await expect(Promise.all([firstWaiter, secondWaiter])).resolves.toEqual([file, file]);
    expect(state.isRequestPending('request-key')).toBe(false);
  });

  it('resolves failed requests to null and clears request bookkeeping', async () => {
    const state = createImageFileRequestState();

    state.startRequest('request-key');
    const waiter = state.waitForRequest('request-key');
    state.completeRequest('request-key', null);

    await expect(waiter).resolves.toBeNull();
    expect(state.isRequestPending('request-key')).toBe(false);
  });

  it('clears cache and pending request state', () => {
    const state = createImageFileRequestState();
    state.setCached('image', new File(['image'], 'image.jpg'));
    state.startRequest('request-key');

    state.clear();

    expect(state.getCached('image')).toBeUndefined();
    expect(state.isRequestPending('request-key')).toBe(false);
    expect(state.getStats()).toEqual({ count: 0, sizeBytes: 0 });
  });
});
