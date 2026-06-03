import { describe, expect, it, vi } from 'vitest';
import { buildImageBitmap } from '../test/builders';
import {
  clearAsyncImageCacheState,
  createAsyncImageCacheState,
  getAsyncImageCacheStats,
  movePendingImageCacheItemToFront,
  type AsyncImageCachePendingItem,
} from './asyncImageCacheState';

function createPending<T>(
  cacheKey: string,
  resolve: (result: T | null) => void = vi.fn()
): AsyncImageCachePendingItem<T> {
  return {
    bitmap: buildImageBitmap({ close: vi.fn() }),
    cacheKey,
    resolve,
  };
}

describe('async image cache state helpers', () => {
  it('creates empty cache state with default lifecycle flags', () => {
    const state = createAsyncImageCacheState<string>();

    expect(state.cache.size).toBe(0);
    expect(state.loadingPromises.size).toBe(0);
    expect(state.pendingQueue).toEqual([]);
    expect(state.pendingItems).toEqual([]);
    expect(state.activeLoads).toBe(0);
    expect(state.cacheGeneration).toBe(0);
    expect(state.idleCallbackScheduled).toBe(false);
    expect(state.paused).toBe(false);
    expect(state.bulkMode).toBe(false);
  });

  it('clears pending work, cached values, load tracking, and failed-image state', () => {
    const state = createAsyncImageCacheState<string>();
    const pendingResolve = vi.fn();
    const pending = createPending<string>('pending', pendingResolve);
    const dispose = vi.fn();
    const clearFailures = vi.fn();
    state.cache.set('cached', 'cached-value');
    state.loadingPromises.set('loading', Promise.resolve('value'));
    state.pendingQueue.push(vi.fn());
    state.pendingItems.push(pending);
    state.activeLoads = 3;
    state.idleCallbackScheduled = true;

    clearAsyncImageCacheState(state, dispose, clearFailures);

    expect(state.cacheGeneration).toBe(1);
    expect(pending.bitmap.close).toHaveBeenCalledOnce();
    expect(pendingResolve).toHaveBeenCalledWith(null);
    expect(dispose).toHaveBeenCalledWith('cached-value');
    expect(state.cache.size).toBe(0);
    expect(state.loadingPromises.size).toBe(0);
    expect(state.pendingQueue).toEqual([]);
    expect(state.pendingItems).toEqual([]);
    expect(state.activeLoads).toBe(0);
    expect(state.idleCallbackScheduled).toBe(false);
    expect(clearFailures).toHaveBeenCalledOnce();
  });

  it('reports cache stats from loaded, loading, and pending state', () => {
    const state = createAsyncImageCacheState<string>();
    state.cache.set('cached-a', 'a');
    state.cache.set('cached-b', 'b');
    state.loadingPromises.set('loading', Promise.resolve('value'));
    state.pendingItems.push(createPending('pending'));

    expect(getAsyncImageCacheStats(state)).toEqual({
      count: 2,
      loading: 1,
      pending: 1,
    });
  });

  it('moves queued pending work to the front only when it is behind another item', () => {
    const first = createPending<string>('first');
    const middle = createPending<string>('middle');
    const last = createPending<string>('last');
    const pendingItems = [first, middle, last];

    expect(movePendingImageCacheItemToFront(pendingItems, 'last')).toBe(true);
    expect(pendingItems).toEqual([last, first, middle]);
    expect(movePendingImageCacheItemToFront(pendingItems, 'last')).toBe(false);
    expect(movePendingImageCacheItemToFront(pendingItems, 'missing')).toBe(false);
  });
});
