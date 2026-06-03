import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncImageCacheItem } from './useAsyncImageCacheItem';

function createFile(name = 'image.jpg'): File {
  return new File(['image'], name, { type: 'image/jpeg' });
}

function createOptions(overrides: Partial<Parameters<typeof useAsyncImageCacheItem<string>>[0]> = {}) {
  return {
    imageFile: createFile(),
    imageName: 'image.jpg',
    enabled: true,
    cache: new Map<string, string>(),
    loadingPromises: new Map<string, Promise<string | null>>(),
    cacheGeneration: 0,
    queueLoad: vi.fn(async (_file: File, cacheKey: string) => `loaded-${cacheKey}`),
    ...overrides,
  };
}

describe('useAsyncImageCacheItem', () => {
  it('returns a cached value immediately without queueing a load', () => {
    const options = createOptions({
      cache: new Map([['image.jpg', 'cached-value']]),
    });

    const { result } = renderHook(() => useAsyncImageCacheItem(options));

    expect(result.current).toBe('cached-value');
    expect(options.queueLoad).not.toHaveBeenCalled();
  });

  it('clears the current result when disabled', async () => {
    const enabledOptions = createOptions({
      cache: new Map([['image.jpg', 'cached-value']]),
    });
    const { result, rerender } = renderHook(
      (options) => useAsyncImageCacheItem(options),
      { initialProps: enabledOptions }
    );

    expect(result.current).toBe('cached-value');

    rerender({ ...enabledOptions, enabled: false });

    await waitFor(() => expect(result.current).toBeNull());
    expect(enabledOptions.queueLoad).not.toHaveBeenCalled();
  });

  it('queues missing images and publishes the async result', async () => {
    let resolveLoad!: (value: string | null) => void;
    const loadingPromises = new Map<string, Promise<string | null>>();
    const queueLoad = vi.fn((_file: File, cacheKey: string) => {
      return new Promise<string | null>((resolve) => {
        resolveLoad = (value) => resolve(value ?? `loaded-${cacheKey}`);
      });
    });
    const options = createOptions({ loadingPromises, queueLoad });

    const { result } = renderHook(() => useAsyncImageCacheItem(options));

    expect(result.current).toBeNull();
    expect(queueLoad).toHaveBeenCalledWith(options.imageFile, 'image.jpg');
    expect(loadingPromises.has('image.jpg')).toBe(true);

    await act(async () => {
      resolveLoad('loaded-image.jpg');
    });

    await waitFor(() => expect(result.current).toBe('loaded-image.jpg'));
  });

  it('reuses an in-flight promise instead of queueing duplicate work', async () => {
    const existingPromise = Promise.resolve('already-loading');
    const options = createOptions({
      loadingPromises: new Map([['image.jpg', existingPromise]]),
    });

    const { result } = renderHook(() => useAsyncImageCacheItem(options));

    expect(options.queueLoad).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current).toBe('already-loading'));
  });

  it('ignores stale async results after switching images', async () => {
    let resolveFirst!: (value: string | null) => void;
    let resolveSecond!: (value: string | null) => void;
    const loadingPromises = new Map<string, Promise<string | null>>();
    const queueLoad = vi.fn((_file: File, cacheKey: string) => {
      return new Promise<string | null>((resolve) => {
        if (cacheKey === 'first.jpg') {
          resolveFirst = resolve;
          return;
        }

        resolveSecond = resolve;
      });
    });
    const firstOptions = createOptions({
      imageFile: createFile('first.jpg'),
      imageName: 'first.jpg',
      loadingPromises,
      queueLoad,
    });

    const { result, rerender } = renderHook(
      (props) => useAsyncImageCacheItem(props),
      { initialProps: firstOptions }
    );

    rerender({
      ...firstOptions,
      imageFile: createFile('second.jpg'),
      imageName: 'second.jpg',
    });

    await act(async () => {
      resolveFirst('loaded-first.jpg');
    });

    expect(result.current).toBeNull();

    await act(async () => {
      resolveSecond('loaded-second.jpg');
    });

    await waitFor(() => expect(result.current).toBe('loaded-second.jpg'));
  });

  it('returns null during a cache-generation mismatch to avoid stale thumbnails', async () => {
    const options = createOptions({
      cache: new Map([['image.jpg', 'cached-value']]),
    });
    const { result, rerender } = renderHook(
      (props) => useAsyncImageCacheItem(props),
      { initialProps: options }
    );

    expect(result.current).toBe('cached-value');

    rerender({
      ...options,
      cache: new Map(),
      cacheGeneration: 1,
      enabled: false,
    });

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBeNull());
  });
});
