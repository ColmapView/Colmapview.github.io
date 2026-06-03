import { describe, expect, it, vi } from 'vitest';
import { buildIdleDeadline, buildImageBitmap } from '../test/builders';
import type { AsyncImageCachePendingItem } from './asyncImageCacheState';
import { createAsyncImageCacheState } from './asyncImageCacheState';
import { createAsyncImageCacheScheduler } from './asyncImageCacheScheduler';

function createPending<T>(
  cacheKey: string,
  resolve: (result: T | null) => void = vi.fn()
): AsyncImageCachePendingItem<T> {
  return {
    bitmap: buildImageBitmap(),
    cacheKey,
    resolve,
  };
}

function createScheduler(overrides: Partial<Parameters<typeof createAsyncImageCacheScheduler<string>>[0]> = {}) {
  const state = createAsyncImageCacheState<string>();
  const processPendingItem = vi.fn((pending: AsyncImageCachePendingItem<string>) => {
    pending.resolve(`processed:${pending.cacheKey}`);
  });

  return {
    state,
    processPendingItem,
    scheduler: createAsyncImageCacheScheduler({
      state,
      maxSize: 256,
      processCanvas: vi.fn(() => 'processed'),
      idleTimeout: 100,
      idleFallback: 16,
      processPendingItem,
      ...overrides,
    }),
  };
}

describe('async image cache scheduler', () => {
  it('does not process pending work while paused', () => {
    const { state, processPendingItem, scheduler } = createScheduler();
    state.paused = true;
    state.idleCallbackScheduled = true;
    state.pendingItems.push(createPending('paused'));

    scheduler.processPendingItems();

    expect(processPendingItem).not.toHaveBeenCalled();
    expect(state.pendingItems).toHaveLength(1);
    expect(state.idleCallbackScheduled).toBe(false);
  });

  it('processes pending items up to the requested batch size and reschedules leftovers', () => {
    const requestIdleCallback = vi.fn<(callback: IdleRequestCallback, options?: IdleRequestOptions) => number>();
    const { state, processPendingItem, scheduler } = createScheduler({ requestIdleCallback });
    state.pendingItems.push(createPending('first'), createPending('second'));

    scheduler.processPendingItems(undefined, 1);

    expect(processPendingItem).toHaveBeenCalledTimes(1);
    expect(processPendingItem.mock.calls[0][0].cacheKey).toBe('first');
    expect(state.pendingItems.map((item) => item.cacheKey)).toEqual(['second']);
    expect(state.idleCallbackScheduled).toBe(true);
    expect(requestIdleCallback).toHaveBeenCalledOnce();
  });

  it('schedules bulk-mode processing on the microtask queue', () => {
    const scheduleMicrotask = vi.fn((callback: () => void) => callback());
    const { state, processPendingItem, scheduler } = createScheduler({ scheduleMicrotask });
    state.bulkMode = true;
    state.pendingItems.push(createPending('bulk'));

    scheduler.scheduleIdleProcessing();

    expect(scheduleMicrotask).toHaveBeenCalledOnce();
    expect(processPendingItem).toHaveBeenCalledOnce();
    expect(state.pendingItems).toEqual([]);
    expect(state.idleCallbackScheduled).toBe(false);
  });

  it('uses idle callbacks when available and logs throttled idle diagnostics', () => {
    const deadline = buildIdleDeadline({ timeRemaining: () => 12 });
    const requestIdleCallback = vi.fn<(callback: IdleRequestCallback, options?: IdleRequestOptions) => number>((callback) => {
      callback(deadline);
      return 1;
    });
    const log = vi.fn();
    const { state, processPendingItem, scheduler } = createScheduler({
      requestIdleCallback,
      idleProcessingLogger: { next: vi.fn(() => 'idle diagnostic') },
      now: () => 123,
      log,
    });
    state.pendingItems.push(createPending('idle'));

    scheduler.scheduleIdleProcessing();

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 100 });
    expect(log).toHaveBeenCalledWith('idle diagnostic');
    expect(processPendingItem).toHaveBeenCalledOnce();
    expect(state.pendingItems).toEqual([]);
  });

  it('falls back to timeout scheduling without requestIdleCallback support', () => {
    const scheduleTimeout = vi.fn((callback: () => void) => callback());
    const { state, processPendingItem, scheduler } = createScheduler({
      requestIdleCallback: undefined,
      scheduleTimeout,
    });
    state.pendingItems.push(createPending('timeout'));

    scheduler.scheduleIdleProcessing();

    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 16);
    expect(processPendingItem).toHaveBeenCalledOnce();
  });
});
