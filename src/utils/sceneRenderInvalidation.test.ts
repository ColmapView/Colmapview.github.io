import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSceneRender, subscribeSceneRenderInvalidation } from './sceneRenderInvalidation';

afterEach(() => vi.useRealTimers());

describe('scene frame wake signal', () => {
  it('delivers asynchronous resource wakes and coalesces thousands of culling deadlines', () => {
    vi.useFakeTimers();
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderInvalidation(wake);
    requestSceneRender();
    expect(wake).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5000; i++) requestSceneRender(80);
    expect(vi.getTimerCount()).toBe(1);
    requestSceneRender(20);
    vi.advanceTimersByTime(19);
    expect(wake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10000);
    expect(wake).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('cancels deferred work after the last scene unmounts', () => {
    vi.useFakeTimers();
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderInvalidation(wake);
    requestSceneRender(80);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    requestSceneRender(80);
    expect(vi.getTimerCount()).toBe(0);
    expect(wake).not.toHaveBeenCalled();
  });
});
