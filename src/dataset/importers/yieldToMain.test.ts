import { afterEach, describe, expect, it, vi } from 'vitest';
import { yieldToMain } from './yieldToMain';

describe('yieldToMain', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for scheduler.yield when supported', async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const scheduler = { yield: vi.fn(() => promise) };
    const onYield = vi.fn();
    vi.stubGlobal('scheduler', scheduler);
    vi.useFakeTimers();

    const task = yieldToMain().then(onYield);
    await Promise.resolve();

    expect(scheduler.yield).toHaveBeenCalledOnce();
    expect(onYield).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    resolve();
    await task;
    expect(onYield).toHaveBeenCalledOnce();
  });

  it.each([undefined, {}])('waits for a zero-delay timer with scheduler %j', async (scheduler) => {
    vi.stubGlobal('scheduler', scheduler);
    vi.useFakeTimers();
    const onYield = vi.fn();

    const task = yieldToMain().then(onYield);
    await Promise.resolve();

    expect(onYield).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    await task;
    expect(onYield).toHaveBeenCalledOnce();
  });
});
