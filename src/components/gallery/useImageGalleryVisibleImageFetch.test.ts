import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFile, buildReconstruction } from '../../test/builders';
import { useImageGalleryVisibleImageFetch } from './useImageGalleryVisibleImageFetch';

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
    expect(options.dataset.getImage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(options.dataset.getImage).mock.calls.map(([name]) => name)).toEqual([
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
    expect(dataset.getImage).toHaveBeenCalledWith('b.jpg');
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
    expect(dataset.getMask).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dataset.getMask).mock.calls.map(([name]) => name)).toEqual([
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
      expect(dataset.getImage).toHaveBeenCalledTimes(2);
      expect(dataset.getMask).toHaveBeenCalledTimes(2);
    });

    expect(vi.mocked(dataset.getImage).mock.calls.map(([name]) => name)).toEqual([
      'load-a.jpg',
      'load-b.jpg',
    ]);
    expect(vi.mocked(dataset.getMask).mock.calls.map(([name]) => name)).toEqual([
      'load-a.jpg',
      'load-b.jpg',
    ]);
  });

  it('cancels pending refresh callbacks when inputs change', async () => {
    let resolveImage: (file: File) => void = () => undefined;
    const getImage = vi.fn(() => new Promise<File | null>((resolve) => {
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
      expect(getImage).toHaveBeenCalledWith('slow.jpg');
    });

    rerender({
      ...options,
      debouncedIsScrolling: true,
    });

    await act(async () => {
      resolveImage(buildFile('slow.jpg'));
      await Promise.resolve();
    });

    expect(options.refreshImageCacheVersion).not.toHaveBeenCalled();
  });
});
