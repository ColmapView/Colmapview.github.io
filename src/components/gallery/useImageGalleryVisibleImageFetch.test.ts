import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFile, buildReconstruction } from '../../test/builders';
import { useImageGalleryVisibleImageFetch } from './useImageGalleryVisibleImageFetch';
import { createUrlFileCache } from '../../dataset/urlFileCache';
import { createImageFileRequestState } from '../../utils/imageFileRequestState';

type HookOptions = Parameters<typeof useImageGalleryVisibleImageFetch>[0];

const reconstruction = buildReconstruction();

function createVirtualizer(visibleIndexes: number[]) {
  return {
    getVirtualItems: vi.fn(() => visibleIndexes.map((index) => ({ index }))),
  };
}

function createDataset({
  hasImages = true,
  hasMasks = false,
  cachedNames = [],
  cachedMaskNames = [],
  getImage = vi.fn(async (imageName: string) => buildFile(imageName)),
  getMask = vi.fn(async (imageName: string) => buildFile(`${imageName}.png`)),
}: {
  hasImages?: boolean;
  hasMasks?: boolean;
  cachedNames?: string[];
  cachedMaskNames?: string[];
  getImage?: (imageName: string) => Promise<File | null>;
  getMask?: (imageName: string) => Promise<File | null>;
} = {}) {
  return {
    hasImages: vi.fn(() => hasImages),
    hasMasks: vi.fn(() => hasMasks),
    getImageSync: vi.fn((imageName: string) => cachedNames.includes(imageName) ? buildFile(imageName) : undefined),
    getMaskSync: vi.fn((imageName: string) => cachedMaskNames.includes(imageName) ? buildFile(`${imageName}.png`) : undefined),
    getImage,
    getMask,
  };
}

function createOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  const rows = [
    [{ name: 'cached.jpg' }, { name: 'load-a.jpg' }],
    [{ name: 'load-b.jpg' }],
  ];

  return {
    dataset: createDataset({ cachedNames: ['cached.jpg'] }),
    reconstruction,
    viewMode: 'gallery',
    rows,
    images: rows.flat(),
    debouncedIsScrolling: false,
    isSettling: false,
    rowVirtualizer: createVirtualizer([0, 1]),
    listVirtualizer: createVirtualizer([]),
    refreshImageCacheVersion: vi.fn(),
    thumbnailDisplayMode: 'image',
    ...overrides,
  };
}

describe('useImageGalleryVisibleImageFetch', () => {
  it('fetches uncached visible gallery row images and refreshes loaded batches', async () => {
    const options = createOptions();

    renderHook((hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions), {
      initialProps: options,
    });

    await waitFor(() => {
      expect(options.refreshImageCacheVersion).toHaveBeenCalledOnce();
    });

    expect(options.rowVirtualizer.getVirtualItems).toHaveBeenCalledOnce();
    expect(options.listVirtualizer.getVirtualItems).not.toHaveBeenCalled();
    expect(options.dataset.getImage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(options.dataset.getImage).mock.calls.map(([name]) => name)).toEqual([
      'cached.jpg',
      'load-a.jpg',
      'load-b.jpg',
    ]);
    expect(options.dataset.getMask).not.toHaveBeenCalled();
  });

  it('fetches visible list images by list virtualizer index', async () => {
    const dataset = createDataset();
    const options = createOptions({
      dataset,
      viewMode: 'list',
      rows: [],
      images: [{ name: 'a.jpg' }, { name: 'b.jpg' }],
      rowVirtualizer: createVirtualizer([]),
      listVirtualizer: createVirtualizer([1]),
    });

    renderHook((hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions), {
      initialProps: options,
    });

    await waitFor(() => {
      expect(options.refreshImageCacheVersion).toHaveBeenCalledOnce();
    });

    expect(options.rowVirtualizer.getVirtualItems).not.toHaveBeenCalled();
    expect(options.listVirtualizer.getVirtualItems).toHaveBeenCalledOnce();
    expect(dataset.getImage).toHaveBeenCalledWith('b.jpg', { signal: expect.any(AbortSignal), priority: 'visible' });
  });

  it.each([
    {
      name: 'without dataset images',
      override: (options: HookOptions) => ({
        ...options,
        dataset: createDataset({ hasImages: false }),
      }),
    },
    {
      name: 'without reconstruction',
      override: (options: HookOptions) => ({
        ...options,
        reconstruction: null,
      }),
    },
    {
      name: 'while scrolling',
      override: (options: HookOptions) => ({
        ...options,
        debouncedIsScrolling: true,
      }),
    },
    {
      name: 'while settling',
      override: (options: HookOptions) => ({
        ...options,
        isSettling: true,
      }),
    },
  ])('does not fetch $name', ({ override }) => {
    const options = override(createOptions());

    renderHook((hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions), {
      initialProps: options,
    });

    expect(options.rowVirtualizer.getVirtualItems).not.toHaveBeenCalled();
    expect(options.listVirtualizer.getVirtualItems).not.toHaveBeenCalled();
    expect(options.dataset.getImage).not.toHaveBeenCalled();
    expect(options.dataset.getMask).not.toHaveBeenCalled();
  });

  it('fetches uncached masks only in mask thumbnail mode', async () => {
    const dataset = createDataset({
      hasMasks: true,
      cachedMaskNames: ['cached.jpg'],
    });
    const options = createOptions({
      dataset,
      thumbnailDisplayMode: 'mask',
    });

    renderHook((hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions), {
      initialProps: options,
    });

    await waitFor(() => {
      expect(options.refreshImageCacheVersion).toHaveBeenCalledOnce();
    });

    expect(dataset.getImage).not.toHaveBeenCalled();
    expect(dataset.getMask).toHaveBeenCalledTimes(3);
    expect(vi.mocked(dataset.getMask).mock.calls.map(([name]) => name)).toEqual([
      'cached.jpg',
      'load-a.jpg',
      'load-b.jpg',
    ]);
  });

  it.each(['maskedImage', 'inverseMaskedImage', 'hoverMask'] as const)('fetches uncached images and masks in %s thumbnail mode', async (thumbnailDisplayMode) => {
    const dataset = createDataset({
      hasMasks: true,
      cachedNames: ['cached.jpg'],
      cachedMaskNames: ['cached.jpg'],
    });
    const options = createOptions({
      dataset,
      thumbnailDisplayMode,
    });

    renderHook((hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions), {
      initialProps: options,
    });

    await waitFor(() => {
      expect(dataset.getImage).toHaveBeenCalledTimes(3);
      expect(dataset.getMask).toHaveBeenCalledTimes(3);
    });

    expect(vi.mocked(dataset.getImage).mock.calls.map(([name]) => name)).toEqual([
      'cached.jpg',
      'load-a.jpg',
      'load-b.jpg',
    ]);
    expect(vi.mocked(dataset.getMask).mock.calls.map(([name]) => name)).toEqual([
      'cached.jpg',
      'load-a.jpg',
      'load-b.jpg',
    ]);
  });

  it('cancels pending refresh callbacks when inputs change', async () => {
    let resolveImage: (file: File) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const getImage = vi.fn((_name: string, access?: { signal?: AbortSignal }) => new Promise<File | null>((resolve) => {
      signal = access?.signal;
      resolveImage = resolve;
    }));
    const options = createOptions({
      dataset: createDataset({ getImage }),
      rows: [[{ name: 'slow.jpg' }]],
      images: [{ name: 'slow.jpg' }],
      rowVirtualizer: createVirtualizer([0]),
    });

    const { rerender } = renderHook(
      (hookOptions: HookOptions) => useImageGalleryVisibleImageFetch(hookOptions),
      { initialProps: options }
    );

    await waitFor(() => {
      expect(getImage).toHaveBeenCalledWith('slow.jpg', { signal: expect.any(AbortSignal), priority: 'visible' });
    });

    rerender({
      ...options,
      debouncedIsScrolling: true,
    });

    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveImage(buildFile('slow.jpg'));
      await Promise.resolve();
    });

    expect(options.refreshImageCacheVersion).not.toHaveBeenCalled();
  });
});

it('keeps image and mask batches alive across cache-refresh arrays with unchanged visible names', async () => {
  const names = ['a-missing.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
  const imageResolvers = new Map<string, (file: File | null) => void>();
  const maskResolvers = new Map<string, (file: File | null) => void>();
  const imageSignals: AbortSignal[] = [];
  const maskSignals: AbortSignal[] = [];
  const cached = new Set<string>();
  const getImage = vi.fn((name: string, access?: { signal?: AbortSignal }) => {
    imageSignals.push(access!.signal!);
    return new Promise<File | null>(resolve => imageResolvers.set(name, file => {
      if (file) cached.add(name);
      resolve(file);
    }));
  });
  const getMask = vi.fn((name: string, access?: { signal?: AbortSignal }) => {
    maskSignals.push(access!.signal!);
    return new Promise<File | null>(resolve => maskResolvers.set(name, resolve));
  });
  const dataset = createDataset({ hasMasks: true, getImage, getMask });
  dataset.getImageSync.mockImplementation(name => cached.has(name) ? buildFile(name) : undefined);
  const options = createOptions({
    dataset,
    thumbnailDisplayMode: 'maskedImage',
    rows: [names.map(name => ({ name }))],
    images: names.map(name => ({ name })),
    rowVirtualizer: createVirtualizer([0]),
  });
  const { rerender, unmount } = renderHook(useImageGalleryVisibleImageFetch, { initialProps: options });
  expect(getImage).toHaveBeenCalledTimes(5);
  expect(getMask).toHaveBeenCalledTimes(5);
  await act(async () => {
    for (const name of names.slice(0, 5)) imageResolvers.get(name)!(name === 'a-missing.jpg' ? null : buildFile(name));
  });
  expect(options.refreshImageCacheVersion).toHaveBeenCalledOnce();
  expect(getImage).toHaveBeenCalledTimes(6);
  // The cache-version render reconstructs arrays and virtualizer wrappers without
  // changing the requested resources. Failed names must not be retried on this render.
  rerender({ ...options, rows: [names.map(name => ({ name }))], images: names.map(name => ({ name })), rowVirtualizer: createVirtualizer([0]) });
  expect(imageSignals.every(signal => !signal.aborted)).toBe(true);
  expect(maskSignals.every(signal => !signal.aborted)).toBe(true);
  expect(getImage.mock.calls.map(([name]) => name)).toEqual(names);
  expect(getMask).toHaveBeenCalledTimes(5);
  await act(async () => {
    imageResolvers.get('f.jpg')!(buildFile('f.jpg'));
    for (const name of names.slice(0, 5)) maskResolvers.get(name)!(null);
  });
  expect(getMask).toHaveBeenCalledTimes(6);
  expect(getImage.mock.calls.filter(([name]) => name === 'a-missing.jpg')).toHaveLength(1);
  unmount();
  expect(maskSignals.every(signal => signal.aborted)).toBe(true);
  await act(async () => maskResolvers.get('f.jpg')!(null));
});

it('cancels obsolete membership and restarts for newly visible names and replacement datasets', async () => {
  const signals: AbortSignal[] = [];
  const getImage = vi.fn((_name: string, access?: { signal?: AbortSignal }) => {
    signals.push(access!.signal!);
    return new Promise<File | null>(() => {});
  });
  const options = createOptions({ dataset: createDataset({ getImage }), rows: [[{ name: 'a.jpg' }]], rowVirtualizer: createVirtualizer([0]) });
  const { rerender } = renderHook(useImageGalleryVisibleImageFetch, { initialProps: options });
  rerender({ ...options, rows: [[{ name: 'b.jpg' }]] });
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  const replacement = createDataset({ getImage });
  rerender({ ...options, dataset: replacement, rows: [[{ name: 'b.jpg' }]] });
  expect(signals[1].aborted).toBe(true);
  expect(signals[2].aborted).toBe(false);
  expect(getImage.mock.calls.map(([name]) => name)).toEqual(['a.jpg', 'b.jpg', 'b.jpg']);
});


it('refreshes all retained visible pairs before missing batches insert under shared LRU pressure', async () => {
  const cache = createUrlFileCache(12);
  const images = createImageFileRequestState(cache.scope('display'));
  const masks = createImageFileRequestState(cache.scope('mask'));
  const load = async (name: string) => new File(['xx'], name);
  for (const name of ['a.jpg', 'c.jpg', 'd.jpg']) {
    await images.request(name, () => load(name));
    await masks.request(name, () => load(name));
  }
  const imageA = images.peekCached('a.jpg');
  const maskA = masks.peekCached('a.jpg');
  const dataset = {
    hasImages: () => true, hasMasks: () => true,
    getImageSync: images.peekCached, getMaskSync: masks.peekCached,
    getImage: (name: string) => images.request(name, () => load(name)),
    getMask: (name: string) => masks.request(name, () => load(name)),
  };
  const options = createOptions({ dataset, thumbnailDisplayMode: 'maskedImage',
    rows: [[{ name: 'a.jpg' }, { name: 'b.jpg' }]], images: [{ name: 'a.jpg' }, { name: 'b.jpg' }],
    rowVirtualizer: createVirtualizer([0]) });
  renderHook(useImageGalleryVisibleImageFetch, { initialProps: options });
  await waitFor(() => expect(options.refreshImageCacheVersion).toHaveBeenCalledTimes(2));
  expect(images.peekCached('a.jpg')).toBe(imageA);
  expect(masks.peekCached('a.jpg')).toBe(maskA);
  expect(images.peekCached('b.jpg')).toBeDefined();
  expect(masks.peekCached('b.jpg')).toBeDefined();
  expect(images.peekCached('c.jpg')).toBeUndefined();
  expect(masks.peekCached('c.jpg')).toBeUndefined();
});
